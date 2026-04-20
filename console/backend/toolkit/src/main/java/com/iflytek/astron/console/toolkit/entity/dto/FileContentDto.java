package com.iflytek.astron.console.toolkit.entity.dto;

import lombok.Data;

/**
 * Raw file content payload for online editing scenarios.
 */
@Data
public class FileContentDto {
    private Long fileId;
    private Long repoId;
    private String name;
    private String type;
    private String source;
    private String content;
    private Long charCount;
    private Long size;
    private String updateTime;
}
