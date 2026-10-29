from typing import Literal

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


class DataSonnetParam(Param):
    type: Literal["auto", "text", "json", "xml"] = "auto"


class DataSonnetRequest(BaseModel):
    payload: str
    script: str
    inputType: str = "application/json"
    outputType: str = "application/json"
    params: list[DataSonnetParam] = Field(default_factory=list)
