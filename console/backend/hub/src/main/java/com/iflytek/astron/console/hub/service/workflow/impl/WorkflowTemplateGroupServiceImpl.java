package com.iflytek.astron.console.hub.service.workflow.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.iflytek.astron.console.commons.util.space.SpaceInfoUtil;
import com.iflytek.astron.console.hub.entity.WorkflowTemplateGroup;
import com.iflytek.astron.console.hub.entity.maas.ExportedWorkflowTemplate;
import com.iflytek.astron.console.hub.mapper.ExportedWorkflowTemplateMapper;
import com.iflytek.astron.console.hub.mapper.WorkflowTemplateGroupMapper;
import com.iflytek.astron.console.hub.service.workflow.WorkflowTemplateGroupService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * @author cherry
 */
@Service
public class WorkflowTemplateGroupServiceImpl implements WorkflowTemplateGroupService {
    @Autowired
    private WorkflowTemplateGroupMapper workflowTemplateGroupMapper;

    @Autowired
    private ExportedWorkflowTemplateMapper exportedWorkflowTemplateMapper;

    @Override
    public List<WorkflowTemplateGroup> getTemplateGroup() {
        LambdaQueryWrapper<ExportedWorkflowTemplate> templateQueryWrapper = new LambdaQueryWrapper<>();
        templateQueryWrapper.eq(ExportedWorkflowTemplate::getIsDelete, 0)
                .isNotNull(ExportedWorkflowTemplate::getGroupId);
        withSpaceScope(templateQueryWrapper);

        Set<Integer> usedGroupIds = exportedWorkflowTemplateMapper.selectList(templateQueryWrapper).stream()
                .map(ExportedWorkflowTemplate::getGroupId)
                .filter(groupId -> groupId != null)
                .map(Long::intValue)
                .collect(Collectors.toSet());
        if (usedGroupIds.isEmpty()) {
            return Collections.emptyList();
        }

        return workflowTemplateGroupMapper.selectList(new LambdaQueryWrapper<WorkflowTemplateGroup>()
                        .eq(WorkflowTemplateGroup::getIsDelete, 0)
                        .in(WorkflowTemplateGroup::getId, usedGroupIds))
                .stream()
                .sorted(Comparator.comparing(WorkflowTemplateGroup::getSortIndex, Comparator.nullsLast(Comparator.naturalOrder())))
                .toList();
    }

    private LambdaQueryWrapper<ExportedWorkflowTemplate> withSpaceScope(LambdaQueryWrapper<ExportedWorkflowTemplate> queryWrapper) {
        Long spaceId = SpaceInfoUtil.getSpaceId();
        if (spaceId == null) {
            queryWrapper.isNull(ExportedWorkflowTemplate::getSpaceId);
        } else {
            queryWrapper.eq(ExportedWorkflowTemplate::getSpaceId, spaceId);
        }
        return queryWrapper;
    }
}
