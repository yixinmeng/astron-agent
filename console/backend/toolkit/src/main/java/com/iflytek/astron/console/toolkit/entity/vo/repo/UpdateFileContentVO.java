package com.iflytek.astron.console.toolkit.entity.vo.repo;

import lombok.Data;

/**
 * Update raw file content request.
 */
@Data
public class UpdateFileContentVO {
    private Long fileId;
    private String content;
}
