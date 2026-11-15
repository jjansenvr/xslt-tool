<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="3.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:output method="xml" indent="yes"/>

  <xsl:mode on-no-match="shallow-copy"/>

  <xsl:template match="secret"/>

  <xsl:template match="city">
    <town><xsl:apply-templates select="@*|node()"/></town>
  </xsl:template>
</xsl:stylesheet>
