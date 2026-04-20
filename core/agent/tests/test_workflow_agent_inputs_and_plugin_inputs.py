"""Test various input models in workflow_agent_inputs"""

from agent.api.schemas.llm_message import LLMMessage
from agent.api.schemas.workflow_agent_inputs import (
    CustomCompletionInputs,
    CustomCompletionInstructionInputs,
    CustomCompletionModelConfigInputs,
    CustomCompletionPluginInputs,
    CustomCompletionPluginKnowledgeInputs,
    CustomCompletionPluginKnowledgeMatchInputs,
    CustomCompletionPluginSkillInputs,
)


class TestWorkflowAgentInputsModels:
    """Test fields and default values of various input models"""

    def test_model_config_inputs(self) -> None:
        cfg = CustomCompletionModelConfigInputs(
            domain="d", api="url", provider="anthropic", api_key="k"
        )
        assert cfg.domain == "d"
        assert cfg.api == "url"
        assert cfg.provider == "anthropic"
        assert cfg.api_key == "k"

    def test_instruction_inputs_defaults(self) -> None:
        ins = CustomCompletionInstructionInputs()
        assert ins.reasoning == ""
        assert ins.answer == ""

    def test_plugin_knowledge_match_defaults(self) -> None:
        m = CustomCompletionPluginKnowledgeMatchInputs()
        assert m.repo_ids == []
        assert m.doc_ids == []

    def test_plugin_knowledge_inputs_constraints(self) -> None:
        k = CustomCompletionPluginKnowledgeInputs(
            name="n",
            description="d",
            top_k=3,
            match=CustomCompletionPluginKnowledgeMatchInputs(
                repo_ids=["r"], doc_ids=["d"]
            ),
            repo_type=1,
        )
        assert k.name == "n"
        assert k.top_k == 3
        assert k.repo_type == 1

    def test_plugin_inputs_defaults(self) -> None:
        p = CustomCompletionPluginInputs()
        assert p.tools == []
        assert p.mcp_server_ids == []
        assert p.mcp_server_urls == []
        assert p.workflow_ids == []
        assert p.knowledge == []
        assert p.skills == []

    def test_plugin_skill_inputs(self) -> None:
        skill = CustomCompletionPluginSkillInputs(
            repo_id="repo-1",
            name="skill-one",
            description="desc",
            file_id="file-1",
            entry_file_name="SKILL.md",
            content="body",
        )

        assert skill.repo_id == "repo-1"
        assert skill.entry_file_name == "SKILL.md"
        assert skill.content == "body"

    def test_custom_completion_inputs_with_alias(self) -> None:
        inputs = CustomCompletionInputs(
            uid="u",
            messages=[LLMMessage(role="user", content="q")],
            model_config={
                "domain": "d",
                "api": "url",
                "provider": "google",
                "api_key": "k",
            },
            max_loop_count=5,
        )
        assert inputs.model_config_inputs.domain == "d"
        assert inputs.model_config_inputs.provider == "google"
        assert inputs.plugin.tools == []
        assert inputs.max_loop_count == 5
