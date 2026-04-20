"""Tests for workflow skill plugins."""

from dataclasses import dataclass

import pytest
from common.otlp import sid as sid_module
from common.otlp.trace.span import Span

from agent.api.schemas.workflow_agent_inputs import CustomCompletionPluginSkillInputs
from agent.service.plugin.skill import SkillPluginFactory


@dataclass
class _DummySidGen:
    value: str = "test-sid"

    def gen(self) -> str:
        return self.value


@pytest.fixture(autouse=True)
def _setup_sid() -> None:
    if sid_module.sid_generator2 is None:
        sid_module.sid_generator2 = _DummySidGen()  # type: ignore[assignment]


@pytest.mark.asyncio
async def test_skill_plugin_returns_full_content() -> None:
    skill = CustomCompletionPluginSkillInputs(
        repo_id="repo-1",
        name="incident_skill",
        description="Handle incidents",
        file_id="file-1",
        entry_file_name="SKILL.md",
        content="full skill body",
    )
    plugin = SkillPluginFactory(skills=[skill]).gen()[0]
    span = Span(app_id="test-app", uid="test-user")

    result = await plugin.run({}, span)

    assert result.code == 0
    assert result.result["name"] == "incident_skill"
    assert result.result["entry_file_name"] == "SKILL.md"
    assert result.result["content"] == "full skill body"
