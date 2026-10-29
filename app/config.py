import os
from pathlib import Path


SAXON_DIR = Path(os.environ.get("SAXON_DIR", "/opt/saxon"))
DEFAULT_SAXON = os.environ.get("DEFAULT_SAXON", "10.9")
XML_SCHEMA_NAMESPACE = "http://www.w3.org/2001/XMLSchema"
DATASONNET_DIR = Path(os.environ.get("DATASONNET_DIR", "/opt/datasonnet"))
