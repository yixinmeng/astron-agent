import { deleteKnowledgeAPI, listRepos } from '@/services/knowledge';
import { RepoItem } from '@/types/resource';
import { debounce } from 'lodash';
import React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const SKILL_TAG = 'SKILL';

export const useSkillPage = () => {
  const skillRef = useRef<HTMLDivElement | null>(null);
  const loading = useRef(false);

  const [deleteModal, setDeleteModal] = useState(false);
  const [createModal, setCreateModal] = useState(false);
  const [currentSkill, setCurrentSkill] = useState<RepoItem>({} as RepoItem);
  const [skills, setSkills] = useState<RepoItem[]>([]);
  const [searchValue, setSearchValue] = useState('');

  const fetchSkills = useCallback(
    (value?: string) => {
      loading.current = true;
      listRepos({
        pageNo: 1,
        pageSize: 100,
        content: value !== undefined ? value.trim() : searchValue,
        tag: SKILL_TAG,
      })
        .then(data => {
          setSkills(data.pageData || []);
        })
        .finally(() => {
          loading.current = false;
        });
    },
    [searchValue]
  );

  useEffect(() => {
    fetchSkills();
  }, [fetchSkills]);

  useEffect(() => {
    const handleHeaderSearch = (event: CustomEvent) => {
      if (event.detail?.type !== 'skill') {
        return;
      }
      setSearchValue(event.detail.value || '');
      fetchSkills(event.detail.value || '');
    };

    const handleHeaderCreate = (event: CustomEvent) => {
      if (event.detail?.type !== 'skill') {
        return;
      }
      setCreateModal(true);
    };

    window.addEventListener(
      'headerSearch',
      handleHeaderSearch as EventListener
    );
    window.addEventListener(
      'headerCreateSkill',
      handleHeaderCreate as EventListener
    );

    return () => {
      window.removeEventListener(
        'headerSearch',
        handleHeaderSearch as EventListener
      );
      window.removeEventListener(
        'headerCreateSkill',
        handleHeaderCreate as EventListener
      );
    };
  }, [fetchSkills]);

  const handleSearch = useMemo(
    () =>
      debounce((event: React.ChangeEvent<HTMLInputElement>) => {
        const value = event.target.value;
        setSearchValue(value);
        fetchSkills(value);
      }, 400),
    [fetchSkills]
  );

  const handleDelete = useCallback(async () => {
    if (!currentSkill?.id) {
      return;
    }
    await deleteKnowledgeAPI(currentSkill.id, currentSkill.tag);
    setDeleteModal(false);
    fetchSkills();
  }, [currentSkill, fetchSkills]);

  return {
    skillRef,
    deleteModal,
    setDeleteModal,
    createModal,
    setCreateModal,
    currentSkill,
    setCurrentSkill,
    skills,
    searchValue,
    handleSearch,
    handleDelete,
  };
};
