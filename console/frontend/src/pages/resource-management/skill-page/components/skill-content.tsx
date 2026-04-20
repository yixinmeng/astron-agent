import React, { FC } from 'react';
import { useNavigate } from 'react-router-dom';

import ResourceEmpty from '../../resource-empty';
import { RepoItem } from '@/types/resource';

export const SkillContent: FC<{
  skillRef: React.RefObject<HTMLDivElement>;
  skills: RepoItem[];
  setCreateModal: React.Dispatch<React.SetStateAction<boolean>>;
  setDeleteModal: React.Dispatch<React.SetStateAction<boolean>>;
  setCurrentSkill: React.Dispatch<React.SetStateAction<RepoItem>>;
}> = ({
  skillRef,
  skills,
  setCreateModal,
  setDeleteModal,
  setCurrentSkill,
}) => {
  const navigate = useNavigate();

  if (!skills.length) {
    return (
      <ResourceEmpty
        description="还没有 Skill 仓库，先创建一个入口 Skill。"
        buttonText="新建 Skill"
        onCreate={() => setCreateModal(true)}
      />
    );
  }

  return (
    <div ref={skillRef} className="h-full overflow-auto">
      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        {skills.map(skill => (
          <div
            key={skill.id}
            className="cursor-pointer rounded-3xl border border-[#e2e8f0] bg-white p-6 transition hover:border-[#94a3b8] hover:shadow-sm"
            onClick={() => navigate(`/resource/skill/detail/${skill.id}`)}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-[#111827]">
                  {skill.name}
                </div>
                <div className="mt-2 line-clamp-3 text-sm leading-6 text-[#64748b]">
                  {skill.description || '未填写描述'}
                </div>
              </div>
              <div className="rounded-full bg-[#eff6ff] px-3 py-1 text-xs font-medium text-[#2563eb]">
                SKILL
              </div>
            </div>
            <div className="mt-6 grid grid-cols-3 gap-3 rounded-2xl bg-[#f8fafc] p-4 text-sm">
              <div>
                <div className="text-[#94a3b8]">文件</div>
                <div className="mt-1 font-semibold text-[#0f172a]">
                  {skill.fileCount || 0}
                </div>
              </div>
              <div>
                <div className="text-[#94a3b8]">字符</div>
                <div className="mt-1 font-semibold text-[#0f172a]">
                  {skill.charCount || 0}
                </div>
              </div>
              <div>
                <div className="text-[#94a3b8]">Agent 引用</div>
                <div className="mt-1 font-semibold text-[#0f172a]">
                  {skill?.bots?.length || 0}
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                className="rounded-xl border border-[#cbd5e1] px-4 py-2 text-sm text-[#334155]"
                onClick={event => {
                  event.stopPropagation();
                  navigate(`/resource/skill/detail/${skill.id}`);
                }}
              >
                进入
              </button>
              <button
                className="rounded-xl border border-[#fecaca] px-4 py-2 text-sm text-[#dc2626]"
                onClick={event => {
                  event.stopPropagation();
                  setCurrentSkill(skill);
                  setDeleteModal(true);
                }}
              >
                删除
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
