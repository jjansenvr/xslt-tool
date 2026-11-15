<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="3.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:output method="xml" indent="yes"/>

  <xsl:template match="/orders">
    <customers>
      <xsl:for-each-group select="order" group-by="@customer">
        <customer name="{current-grouping-key()}" count="{count(current-group())}" total="{sum(current-group()/@amount)}"/>
      </xsl:for-each-group>
    </customers>
  </xsl:template>
</xsl:stylesheet>
