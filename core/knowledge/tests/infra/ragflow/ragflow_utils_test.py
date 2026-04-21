#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Unit tests for ``RagflowUtils.get_default_dataset_name``.

The helper unifies how ``RAGFLOW_DEFAULT_GROUP`` is read across the four
RAGFlow-strategy call sites (``split`` / ``chunks_save`` /
``chunks_update`` / ``chunks_delete``), preserving the pre-existing
fallback behavior so this refactor is behavior-preserving for callers.
"""

import pytest

from knowledge.infra.ragflow.ragflow_utils import (
    DEFAULT_RAGFLOW_DATASET_NAME,
    RagflowUtils,
)


class TestGetDefaultDatasetName:
    """Tests for ``RagflowUtils.get_default_dataset_name``."""

    def test_returns_env_value_when_set(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("RAGFLOW_DEFAULT_GROUP", "MyCustomKB")
        assert RagflowUtils.get_default_dataset_name() == "MyCustomKB"

    def test_returns_default_when_env_unset(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.delenv("RAGFLOW_DEFAULT_GROUP", raising=False)
        assert RagflowUtils.get_default_dataset_name() == DEFAULT_RAGFLOW_DATASET_NAME

    def test_returns_default_when_env_empty(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("RAGFLOW_DEFAULT_GROUP", "")
        assert RagflowUtils.get_default_dataset_name() == DEFAULT_RAGFLOW_DATASET_NAME
