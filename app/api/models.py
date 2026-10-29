from pydantic import BaseModel, Field

from app.config import DEFAULT_SAXON


class Param(BaseModel):
    name: str
    value: str = ""


class TransformRequest(BaseModel):
    xml: str
    xslt: str
    params: list[Param] = Field(default_factory=list)
    saxon: str = DEFAULT_SAXON


class ValidateRequest(BaseModel):
    xml: str
    xsd: str


class GenerateXsdRequest(BaseModel):
    xml: str
