import React, { FC, memo } from 'react';

import SiderContainer from '@/components/sider-container';
import { DeleteModal, CreateModal } from './components/modal-component';
import { SkillContent } from './components/skill-content';
import { useSkillPage } from './hooks/use-skill-page';

const SkillPage: FC = () => {
  const {
    skillRef,
    deleteModal,
    setDeleteModal,
    createModal,
    setCreateModal,
    currentSkill,
    setCurrentSkill,
    skills,
    handleDelete,
  } = useSkillPage();

  return (
    <div className="h-full w-full overflow-hidden">
      {deleteModal && (
        <DeleteModal
          currentSkill={currentSkill}
          setDeleteModal={setDeleteModal}
          onDelete={handleDelete}
        />
      )}
      {createModal && <CreateModal setCreateModal={setCreateModal} />}
      <SiderContainer
        rightContent={
          <SkillContent
            skillRef={skillRef as React.RefObject<HTMLDivElement>}
            skills={skills}
            setCreateModal={setCreateModal}
            setDeleteModal={setDeleteModal}
            setCurrentSkill={setCurrentSkill}
          />
        }
      />
    </div>
  );
};

export default memo(SkillPage);
