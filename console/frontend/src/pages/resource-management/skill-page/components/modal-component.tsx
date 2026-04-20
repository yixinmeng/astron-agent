import React, { FC, useState } from 'react';
import { Button, Form, Input } from 'antd';
import { useNavigate } from 'react-router-dom';

import { createKnowledgeAPI } from '@/services/knowledge';
import { RepoItem } from '@/types/resource';

const { TextArea } = Input;

export const DeleteModal: FC<{
  currentSkill: RepoItem;
  setDeleteModal: (value: boolean) => void;
  onDelete: () => void;
}> = ({ currentSkill, setDeleteModal, onDelete }) => {
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    setLoading(true);
    try {
      await onDelete();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mask">
      <div className="absolute top-1/2 left-1/2 w-[360px] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6">
        <div className="text-lg font-semibold text-[#111827]">删除 Skill</div>
        <div className="mt-4 rounded-xl bg-[#f8fafc] px-4 py-3 text-sm text-[#111827]">
          {currentSkill?.name}
        </div>
        <p className="mt-4 text-sm text-[#64748b]">
          删除后该 Skill 仓库中的文件将无法恢复。
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <Button onClick={() => setDeleteModal(false)}>取消</Button>
          <Button danger loading={loading} onClick={handleDelete}>
            删除
          </Button>
        </div>
      </div>
    </div>
  );
};

export const CreateModal: FC<{ setCreateModal: (value: boolean) => void }> = ({
  setCreateModal,
}) => {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [desc, setDesc] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    const values = await form.validateFields();
    setLoading(true);
    try {
      const data = await createKnowledgeAPI({
        name: values.name.trim(),
        desc,
        tag: 'SKILL',
      });
      setCreateModal(false);
      navigate(`/resource/skill/detail/${data.id}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mask">
      <div className="absolute top-1/2 left-1/2 w-[480px] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6">
        <div className="text-lg font-semibold text-[#111827]">新建 Skill</div>
        <Form className="mt-6" form={form} layout="vertical">
          <Form.Item
            label="Skill 仓库名称"
            name="name"
            rules={[{ required: true, message: '请输入名称' }]}
          >
            <Input maxLength={50} placeholder="例如：jira-incident-skill" />
          </Form.Item>
        </Form>
        <div className="mt-4">
          <div className="mb-2 text-sm font-medium text-[#111827]">描述</div>
          <TextArea
            value={desc}
            onChange={event => setDesc(event.target.value)}
            maxLength={200}
            placeholder="说明这个 Skill 的适用场景"
            style={{ minHeight: 96, resize: 'none' }}
          />
        </div>
        <div className="mt-4 rounded-xl border border-dashed border-[#cbd5e1] bg-[#f8fafc] px-4 py-3 text-sm text-[#475569]">
          建议根目录放置入口 <code>SKILL.md</code>，辅助脚本放在
          <code className="mx-1">scripts/</code>，补充资料放在
          <code className="mx-1">references/</code>。
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <Button onClick={() => setCreateModal(false)}>取消</Button>
          <Button loading={loading} type="primary" onClick={handleCreate}>
            创建
          </Button>
        </div>
      </div>
    </div>
  );
};
