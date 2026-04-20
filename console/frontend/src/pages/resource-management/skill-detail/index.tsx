import React, { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Dropdown, Input, Modal, Tabs, Upload, message } from 'antd';
import type { UploadRequestOption } from 'rc-upload/lib/interface';

import MonacoEditor from '@/components/monaco-editor';
import GlobalMarkDown from '@/components/global-markdown';
import http from '@/utils/http';
import {
  createFolderAPI,
  deleteFileAPI,
  deleteFolderAPI,
  getFileContentAPI,
  getKnowledgeDetail,
  listFileDirectoryTree,
  queryFileList,
  updateFileAPI,
  updateFileContentAPI,
  updateFolderAPI,
} from '@/services/knowledge';
import { FileContentItem, FileItem, RepoItem } from '@/types/resource';

const FILE_TYPES_CAN_EDIT = new Set([
  'md',
  'txt',
  'yaml',
  'yml',
  'json',
  'py',
  'js',
  'ts',
  'csv',
  'xml',
]);

const getLanguage = (fileName?: string, type?: string) => {
  const ext = (type || fileName?.split('.').pop() || '').toLowerCase();
  const mapping: Record<string, string> = {
    md: 'markdown',
    txt: 'plaintext',
    yaml: 'yaml',
    yml: 'yaml',
    json: 'json',
    py: 'python',
    js: 'javascript',
    ts: 'typescript',
    csv: 'plaintext',
    xml: 'xml',
  };
  return mapping[ext] || 'plaintext';
};

const buildDefaultSkillTemplate = (name?: string, description?: string) => `---
name: ${name || 'new-skill'}
description: ${description || 'Describe when this skill should be used.'}
---

# Goal

Describe the primary job of this skill.

# Workflow

1. Clarify the user's objective.
2. Inspect the available context and files.
3. Execute the required steps.

# Output

Describe the expected result and quality bar.
`;

const SkillDetail: FC = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const repoId = id || '';

  const [repo, setRepo] = useState<RepoItem>({} as RepoItem);
  const [parentId, setParentId] = useState<number | string>(-1);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<
    { id: string; name: string; parentId?: number }[]
  >([]);
  const [searchValue, setSearchValue] = useState('');
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [fileContent, setFileContent] = useState<FileContentItem | null>(null);
  const [editorValue, setEditorValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const refreshFiles = useCallback(async () => {
    if (!repoId) {
      return;
    }
    setLoading(true);
    try {
      const [repoData, fileData] = await Promise.all([
        getKnowledgeDetail(repoId, 'SKILL'),
        queryFileList({
          repoId,
          parentId,
          pageNo: 1,
          pageSize: 200,
          tag: 'SKILL',
        }),
      ]);
      setRepo(repoData);
      setFiles(
        (fileData.pageData || []).map(item => ({
          ...item,
          type: item.isFile ? item.fileInfoV2?.type : 'folder',
        }))
      );
      if (parentId !== -1) {
        const tree = await listFileDirectoryTree({ repoId, fileId: parentId });
        setBreadcrumbs(tree);
      } else {
        setBreadcrumbs([]);
      }
    } finally {
      setLoading(false);
    }
  }, [parentId, repoId]);

  useEffect(() => {
    refreshFiles();
  }, [refreshFiles]);

  const openFile = useCallback(async (file: FileItem) => {
    if (!file?.isFile) {
      return;
    }
    const data = await getFileContentAPI(file.fileId || file.id);
    setSelectedFile(file);
    setFileContent(data);
    setEditorValue(data.content || '');
  }, []);

  const filteredFiles = useMemo(() => {
    if (!searchValue.trim()) {
      return files;
    }
    return files.filter(item =>
      item.name.toLowerCase().includes(searchValue.trim().toLowerCase())
    );
  }, [files, searchValue]);

  const editable = useMemo(() => {
    if (!selectedFile?.isFile) {
      return false;
    }
    return FILE_TYPES_CAN_EDIT.has(
      (selectedFile.fileInfoV2?.type || '').toLowerCase()
    );
  }, [selectedFile]);

  const handleCreateFolder = () => {
    let folderName = '';
    Modal.confirm({
      title: '新建文件夹',
      icon: null,
      content: (
        <Input
          autoFocus
          placeholder="请输入文件夹名称"
          onChange={event => {
            folderName = event.target.value;
          }}
        />
      ),
      onOk: async () => {
        if (!folderName.trim()) {
          message.warning('请输入文件夹名称');
          return Promise.reject();
        }
        await createFolderAPI({
          repoId: Number(repoId),
          parentId: Number(parentId),
          name: folderName.trim(),
        });
        await refreshFiles();
      },
    });
  };

  const handleRename = (file: FileItem) => {
    let nextName = file.name;
    Modal.confirm({
      title: file.isFile ? '重命名文件' : '重命名文件夹',
      icon: null,
      content: (
        <Input
          defaultValue={file.name}
          onChange={event => {
            nextName = event.target.value;
          }}
        />
      ),
      onOk: async () => {
        if (!nextName.trim()) {
          message.warning('名称不能为空');
          return Promise.reject();
        }
        if (file.isFile) {
          await updateFileAPI({
            id: file.id,
            name: nextName.trim(),
          });
        } else {
          await updateFolderAPI({
            id: file.id,
            name: nextName.trim(),
          });
        }
        await refreshFiles();
      },
    });
  };

  const handleDelete = async (file: FileItem) => {
    if (file.isFile) {
      await deleteFileAPI(Number(repoId), file.id, 'SKILL');
      if (selectedFile?.id === file.id) {
        setSelectedFile(null);
        setFileContent(null);
        setEditorValue('');
      }
    } else {
      await deleteFolderAPI(file.id);
    }
    await refreshFiles();
  };

  const uploadFile = async (
    file: File,
    callbacks?: {
      onSuccess?: UploadRequestOption['onSuccess'];
      onError?: UploadRequestOption['onError'];
    }
  ) => {
    const form = new FormData();
    form.append('file', file);
    form.append('parentId', String(parentId));
    form.append('repoId', String(repoId));
    form.append('tag', 'SKILL');
    try {
      await http.post('/file/upload', form, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      message.success('上传成功');
      callbacks?.onSuccess?.({}, undefined as never);
      await refreshFiles();
    } catch (error) {
      callbacks?.onError?.(error as Error);
    }
  };

  const handleUpload = async (options: UploadRequestOption) => {
    await uploadFile(options.file as File, {
      onSuccess: options.onSuccess,
      onError: options.onError,
    });
  };

  const uploadVirtualFile = async (fileName: string, content: string) => {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const file = new File([blob], fileName, {
      type: 'text/markdown;charset=utf-8',
    });
    await uploadFile(file);
  };

  const handleSave = async () => {
    if (!selectedFile) {
      return;
    }
    setSaving(true);
    try {
      await updateFileContentAPI({
        fileId: selectedFile.fileId || selectedFile.id,
        content: editorValue,
      });
      const refreshed = await getFileContentAPI(
        selectedFile.fileId || selectedFile.id
      );
      setFileContent(refreshed);
      setEditorValue(refreshed.content || '');
      message.success('保存成功');
      await refreshFiles();
    } finally {
      setSaving(false);
    }
  };

  const renderActions = (file: FileItem) => (
    <Dropdown
      menu={{
        items: [
          {
            key: 'rename',
            label: '重命名',
          },
          {
            key: 'delete',
            danger: true,
            label: '删除',
          },
        ],
        onClick: ({ key }) => {
          if (key === 'rename') {
            handleRename(file);
            return;
          }
          Modal.confirm({
            title: file.isFile ? '删除文件' : '删除文件夹',
            content: `确认删除 ${file.name} 吗？`,
            onOk: () => handleDelete(file),
          });
        },
      }}
      trigger={['click']}
    >
      <button className="rounded-lg border border-[#cbd5e1] px-2 py-1 text-xs text-[#475569]">
        操作
      </button>
    </Dropdown>
  );

  return (
    <div className="flex h-full w-full flex-col gap-6 px-6 pb-6">
      <div className="flex items-center justify-between pt-6">
        <div>
          <div className="text-2xl font-semibold text-[#111827]">
            {repo.name || 'Skill'}
          </div>
          <div className="mt-2 text-sm text-[#64748b]">
            {repo.description ||
              '在这里维护入口 SKILL.md、辅助脚本和 references。'}
          </div>
        </div>
        <Button onClick={() => navigate('/resource/skill')}>返回列表</Button>
      </div>

      <div className="grid flex-1 grid-cols-[420px_minmax(0,1fr)] gap-6 overflow-hidden">
        <div className="flex h-full flex-col rounded-3xl border border-[#e2e8f0] bg-white p-5">
          <div className="flex items-center justify-between">
            <div className="text-lg font-semibold text-[#111827]">文件系统</div>
            <div className="flex items-center gap-2">
              <Upload showUploadList={false} customRequest={handleUpload}>
                <Button>上传文件</Button>
              </Upload>
              <Button
                onClick={() =>
                  uploadVirtualFile(
                    'SKILL.md',
                    buildDefaultSkillTemplate(repo.name, repo.description)
                  )
                }
              >
                新建 SKILL.md
              </Button>
              <Button type="primary" onClick={handleCreateFolder}>
                新建文件夹
              </Button>
            </div>
          </div>
          <div className="mt-4">
            <Input
              value={searchValue}
              onChange={event => setSearchValue(event.target.value)}
              placeholder="筛选当前目录文件"
            />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-[#64748b]">
            <button
              className="rounded-lg bg-[#f8fafc] px-3 py-1.5 text-[#0f172a]"
              onClick={() => setParentId(-1)}
            >
              根目录
            </button>
            {breadcrumbs.map(item => (
              <button
                key={item.id}
                className="rounded-lg bg-[#f8fafc] px-3 py-1.5"
                onClick={() => setParentId(item.id)}
              >
                {item.name}
              </button>
            ))}
          </div>
          <div className="mt-4 flex-1 overflow-auto">
            {loading ? (
              <div className="py-12 text-center text-sm text-[#94a3b8]">
                加载中...
              </div>
            ) : filteredFiles.length === 0 ? (
              <div className="py-12 text-center text-sm text-[#94a3b8]">
                当前目录还没有文件
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {filteredFiles.map(file => (
                  <div
                    key={String(file.id)}
                    className={`flex items-center justify-between rounded-2xl border px-4 py-3 ${
                      selectedFile?.id === file.id
                        ? 'border-[#2563eb] bg-[#eff6ff]'
                        : 'border-[#e2e8f0] bg-[#fff]'
                    }`}
                  >
                    <button
                      className="flex flex-1 items-center gap-3 text-left"
                      onClick={() => {
                        if (file.isFile) {
                          openFile(file);
                        } else {
                          setParentId(file.id);
                        }
                      }}
                    >
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#f8fafc] text-xs font-semibold text-[#334155]">
                        {file.isFile
                          ? (file.fileInfoV2?.type || 'txt').toUpperCase()
                          : 'DIR'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-[#111827]">
                          {file.name}
                        </div>
                        <div className="mt-1 text-xs text-[#94a3b8]">
                          {file.isFile
                            ? `字符 ${file.fileInfoV2?.charCount || 0}`
                            : '文件夹'}
                        </div>
                      </div>
                    </button>
                    {renderActions(file)}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex h-full min-w-0 flex-col rounded-3xl border border-[#e2e8f0] bg-white p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-lg font-semibold text-[#111827]">
                {selectedFile?.name || '请选择一个文件'}
              </div>
              <div className="mt-1 text-sm text-[#64748b]">
                入口文件建议命名为 <code>SKILL.md</code>，Agent
                导入时会优先读取它。
              </div>
            </div>
            {selectedFile && editable && (
              <Button loading={saving} type="primary" onClick={handleSave}>
                保存内容
              </Button>
            )}
          </div>
          {!selectedFile ? (
            <div className="flex flex-1 items-center justify-center text-sm text-[#94a3b8]">
              从左侧选择文件后即可在线编辑或预览。
            </div>
          ) : !editable ? (
            <div className="flex flex-1 items-center justify-center text-sm text-[#94a3b8]">
              当前文件类型不支持在线编辑。
            </div>
          ) : (
            <div className="mt-4 min-h-0 flex-1 overflow-hidden">
              <Tabs
                defaultActiveKey="editor"
                items={[
                  {
                    key: 'editor',
                    label: '编辑',
                    children: (
                      <div className="h-[calc(100vh-280px)] overflow-hidden rounded-2xl border border-[#e2e8f0] global-monaco-editor-python">
                        <MonacoEditor
                          height="100%"
                          language={getLanguage(
                            selectedFile.name,
                            selectedFile.fileInfoV2?.type
                          )}
                          value={editorValue}
                          onChange={value => setEditorValue(value || '')}
                          options={{
                            readOnly: false,
                          }}
                        />
                      </div>
                    ),
                  },
                  {
                    key: 'preview',
                    label: '预览',
                    children: (
                      <div className="h-[calc(100vh-280px)] overflow-auto rounded-2xl border border-[#e2e8f0] bg-[#fafafa] p-6">
                        {(fileContent?.type || '').toLowerCase() === 'md' ? (
                          <GlobalMarkDown
                            content={editorValue}
                            isSending={false}
                          />
                        ) : (
                          <pre className="whitespace-pre-wrap break-words text-sm text-[#0f172a]">
                            {editorValue}
                          </pre>
                        )}
                      </div>
                    ),
                  },
                ]}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SkillDetail;
