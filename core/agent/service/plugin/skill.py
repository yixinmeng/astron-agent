import time
from typing import List

from common.otlp.trace.span import Span
from pydantic import BaseModel

from agent.api.schemas.workflow_agent_inputs import CustomCompletionPluginSkillInputs
from agent.service.plugin.base import BasePlugin, PluginResponse


class SkillPluginRunner(BaseModel):
    name: str
    content: str
    entry_file_name: str = "SKILL.md"

    async def run(self, action_input: dict, span: Span) -> PluginResponse:
        with span.start("RunSkill") as sp:
            start_time = int(round(time.time() * 1000))
            result = {
                "name": self.name,
                "entry_file_name": self.entry_file_name,
                "content": self.content,
            }
            end_time = int(round(time.time() * 1000))
            plugin_response = PluginResponse(
                code=0,
                sid=sp.sid,
                start_time=start_time,
                end_time=end_time,
                result=result,
                log=[
                    {
                        "name": self.name,
                        "input": action_input,
                        "output": result,
                    }
                ],
            )
            return plugin_response


class SkillPlugin(BasePlugin):
    repo_id: str
    file_id: str = ""


class SkillPluginFactory(BaseModel):
    skills: List[CustomCompletionPluginSkillInputs]

    def gen(self) -> list[SkillPlugin]:
        plugins: list[SkillPlugin] = []
        for skill in self.skills:
            skill_name = (skill.name or skill.entry_file_name or skill.repo_id).strip()
            skill_description = (
                skill.description
                or f"Load the full contents of {skill.entry_file_name or 'SKILL.md'} before using this skill."
            )
            schema_template = (
                f"tool_name:{skill_name}, "
                f"tool_description:{skill_description}, "
                'tool_parameters:{"type":"object","properties":{},"required":[]}'
            )
            plugins.append(
                SkillPlugin(
                    repo_id=skill.repo_id,
                    file_id=skill.file_id,
                    name=skill_name,
                    description=skill_description,
                    schema_template=schema_template,
                    typ="skill",
                    run=SkillPluginRunner(
                        name=skill_name,
                        content=skill.content,
                        entry_file_name=skill.entry_file_name or "SKILL.md",
                    ).run,
                )
            )
        return plugins
