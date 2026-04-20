#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tests for RagflowRAGStrategy pagination / existence-check fixes (RF-19).

Covers:
- `_validate_document_exists()` — delegates to `ragflow_client.get_document_info`.
- `_get_existing_chunks()` — uses `ragflow_client.fetch_all_document_chunks`.
"""

from typing import Any, Dict, List
from unittest.mock import AsyncMock, patch

import pytest

from knowledge.consts.error_code import CodeEnum
from knowledge.exceptions.exception import CustomException
from knowledge.service.impl.ragflow_strategy import RagflowRAGStrategy

# Mock paths — extracted so a future rename of the strategy module doesn't
# require chasing string literals across tests.
_GET_DOC_INFO = (
    "knowledge.service.impl.ragflow_strategy.ragflow_client.get_document_info"
)
_LIST_DOCS = (
    "knowledge.service.impl.ragflow_strategy.ragflow_client.list_documents_in_dataset"
)


# ----------------------------------------------------------------------
# Section A: _validate_document_exists
# ----------------------------------------------------------------------


# Every test below pins BOTH the new helper (`get_document_info`) AND the
# underlying `list_documents_in_dataset`. The second patch is a regression
# guard: it asserts (via `mock_list.assert_not_awaited()`) that the
# implementation never falls back to the old direct-client path. Also keeps
# test failures local/deterministic — no real HTTP regardless of wiring.


@pytest.mark.asyncio
async def test_validate_document_exists_success_when_get_document_info_returns_doc() -> (
    None
):
    """`get_document_info` returns a dict => validation passes silently.

    Also asserts the new helper is the code path actually taken; if the old
    implementation is still in place it will instead call
    `list_documents_in_dataset` and `mock_get` will stay un-awaited.
    """
    strategy = RagflowRAGStrategy()
    with (
        patch(
            _GET_DOC_INFO,
            new=AsyncMock(return_value={"id": "doc-x", "name": "t.pdf"}),
        ) as mock_get,
        patch(
            _LIST_DOCS,
            new=AsyncMock(
                return_value={"code": 0, "data": {"docs": [{"id": "doc-x"}]}}
            ),
        ) as mock_list,
    ):
        await strategy._validate_document_exists("ds-1", "doc-x")
    mock_get.assert_awaited_once_with("ds-1", "doc-x")
    mock_list.assert_not_awaited()


@pytest.mark.asyncio
async def test_validate_document_exists_raises_when_get_document_info_returns_none() -> (
    None
):
    """`get_document_info` returns None => CustomException(ChunkSaveFailed)."""
    strategy = RagflowRAGStrategy()
    # `list_documents_in_dataset` is mocked as "doc exists" so the old implementation
    # would mistakenly PASS validation — that way the red-light failure is stable
    # (CustomException not raised) instead of a network error.
    with (
        patch(
            _GET_DOC_INFO,
            new=AsyncMock(return_value=None),
        ) as mock_get,
        patch(
            _LIST_DOCS,
            new=AsyncMock(
                return_value={"code": 0, "data": {"docs": [{"id": "doc-x"}]}}
            ),
        ) as mock_list,
    ):
        with pytest.raises(CustomException) as exc_info:
            await strategy._validate_document_exists("ds-1", "doc-x")
    assert exc_info.value.code == CodeEnum.ChunkSaveFailed.code
    assert "doc-x" in str(exc_info.value)
    mock_get.assert_awaited_once_with("ds-1", "doc-x")
    mock_list.assert_not_awaited()


@pytest.mark.asyncio
async def test_validate_document_exists_raises_on_unexpected_exception() -> None:
    """Underlying transport error => CustomException, not bare RuntimeError.

    Red-light stability: without the `mock_get.assert_awaited_once` check at
    the end, the old implementation would ALSO pass this test — its own
    try/except converts the RuntimeError raised by the mocked
    list_documents_in_dataset into CustomException(ChunkSaveFailed). The
    assertion that the new helper was called is what distinguishes the
    two implementations.
    """
    strategy = RagflowRAGStrategy()
    with (
        patch(
            _GET_DOC_INFO,
            new=AsyncMock(side_effect=RuntimeError("network down")),
        ) as mock_get,
        patch(
            _LIST_DOCS,
            new=AsyncMock(side_effect=RuntimeError("network down")),
        ) as mock_list,
    ):
        with pytest.raises(CustomException) as exc_info:
            await strategy._validate_document_exists("ds-1", "doc-x")
    assert exc_info.value.code == CodeEnum.ChunkSaveFailed.code
    mock_get.assert_awaited_once_with("ds-1", "doc-x")
    mock_list.assert_not_awaited()
