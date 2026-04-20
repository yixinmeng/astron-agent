import React, { useCallback, useMemo } from 'react';
import { Button, message } from 'antd';
import { useTranslation } from 'react-i18next';

import { FlowInput } from '@/components/workflow/ui';
import { RepoItem } from '@/types/resource';

import search from '@/assets/imgs/workflow/search-icon.svg';
import publishIcon from '@/assets/imgs/workflow/publish-icon.png';
import skillIcon from '@/assets/imgs/workflow/knowledgeIcon.png';
import toolModalAdd from '@/assets/imgs/workflow/tool-modal-add.png';

const SkillToolbar = ({
  searchValue,
  handleInputChange,
}: {
  searchValue: string;
  handleInputChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}) => {
  return (
    <div
      className="mx-auto flex items-center justify-between"
      style={{
        width: '90%',
        minWidth: 1000,
      }}
    >
      <div className="relative">
        <img
          src={search}
          className="absolute left-[10px] top-[7px] z-10 h-4 w-4"
          alt=""
        />
        <FlowInput
          value={searchValue}
          className="h-[32px] w-[320px] pl-8 text-sm"
          placeholder="搜索 Skill"
          onChange={handleInputChange}
        />
      </div>
      <Button
        type="primary"
        className="flex items-center gap-2"
        onClick={e => {
          e.stopPropagation();
          window.open(`${window.location.origin}/resource/skill`, '_blank');
        }}
        style={{
          height: 40,
        }}
      >
        <img className="h-3 w-3" src={toolModalAdd} alt="" />
        <span>新建 Skill</span>
      </Button>
    </div>
  );
};

function SkillList({
  dataSource,
  toolRef,
  searchValue,
  handleInputChange,
  toolsList,
  loading,
  handleAddTool,
}: {
  dataSource: RepoItem[];
  toolRef: React.RefObject<HTMLDivElement>;
  searchValue: string;
  handleInputChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  toolsList: { toolId: string }[];
  loading: boolean;
  handleAddTool: (tool: {
    toolId: string;
    type: 'skill';
    name: string;
    description?: string;
    tag?: string;
  }) => void;
}) {
  const { t } = useTranslation();
  const checkedIds = useMemo(() => {
    return toolsList?.map(item => item?.toolId) || [];
  }, [toolsList]);

  const handleChangeSkill = useCallback(
    (skill: RepoItem) => {
      const skillRepoId = skill.coreRepoId || skill.outerRepoId;
      if (!checkedIds.includes(skillRepoId) && checkedIds.length >= 30) {
        message.warning(t('workflow.nodes.common.maxAddWarning'));
        return;
      }
      handleAddTool({
        toolId: skillRepoId,
        type: 'skill',
        name: skill.name,
        description: skill.description,
        tag: skill.tag,
      });
    },
    [checkedIds, handleAddTool, t]
  );

  return (
    <div
      className="flex h-full flex-col overflow-hidden"
      style={{
        padding: '26px 0 43px',
      }}
    >
      <div className="flex h-full flex-col overflow-hidden">
        <div className="mt-4 flex flex-1 flex-col gap-1.5 overflow-hidden">
          <SkillToolbar
            searchValue={searchValue}
            handleInputChange={handleInputChange}
          />
          <div className="flex flex-col gap-[18px] overflow-hidden">
            <div
              className="mx-auto flex items-center px-4 font-medium"
              style={{
                width: '90%',
                minWidth: 1000,
              }}
            >
              <span className="flex-1">Skill</span>
              <span className="w-2/5 min-w-[500px]">更新时间</span>
            </div>
            <div className="flex-1 overflow-auto" ref={toolRef}>
              <div
                className="mx-auto h-full"
                style={{
                  width: '90%',
                  minWidth: 1000,
                }}
              >
                {dataSource.map(item => (
                  <div
                    key={item.id}
                    className="cursor-pointer border-t border-[#E5E5EC] px-4 py-2.5 hover:bg-[#EBEBF1]"
                  >
                    <div className="flex justify-between gap-[52px]">
                      <div className="flex flex-1 items-center gap-[30px] overflow-hidden">
                        <img
                          src={skillIcon}
                          className="h-[40px] w-[40px] rounded"
                          alt=""
                        />
                        <div className="flex flex-1 flex-col gap-1 overflow-hidden">
                          <div className="flex items-center gap-2 font-semibold">
                            <span>{item.name}</span>
                            <div className="rounded bg-[#F0F0F0] px-2 py-1 text-xs">
                              {item.tag || 'SKILL'}
                            </div>
                          </div>
                          <p
                            className="flex-1 text-overflow text-xs text-[#757575]"
                            title={item.description}
                          >
                            {item.description}
                          </p>
                        </div>
                      </div>
                      <div className="flex w-2/5 min-w-[500px] items-center justify-between">
                        <div className="flex w-1/3 flex-shrink-0 items-center gap-1.5">
                          <img src={publishIcon} className="h-3 w-3" alt="" />
                          <p className="text-xs text-[#757575]">
                            {item.updateTime}
                          </p>
                        </div>
                        <div>
                          {checkedIds.includes(
                            item.coreRepoId || item.outerRepoId
                          ) ? (
                            <div
                              className="rounded-lg border border-[#D3DBF8] bg-[#fff] px-6 py-1"
                              style={{ height: '40px', lineHeight: '30px' }}
                              onClick={() => handleChangeSkill(item)}
                            >
                              移除
                            </div>
                          ) : (
                            <Button
                              type="primary"
                              className="px-6"
                              style={{ height: 40 }}
                              onClick={() => handleChangeSkill(item)}
                            >
                              {t('workflow.nodes.toolNode.addTool')}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {!loading && dataSource.length === 0 ? (
                  <p className="mt-3 px-4">暂无 Skill</p>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SkillList;
