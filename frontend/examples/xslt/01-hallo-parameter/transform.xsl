<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="3.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:output method="xml" indent="yes"/>
  <xsl:param name="greeting" select="'Hallo'"/>

  <xsl:template match="/persons">
    <greetings>
      <xsl:for-each select="person">
        <greeting id="{@id}"><xsl:value-of select="concat($greeting, ' ', name)"/></greeting>
      </xsl:for-each>
    </greetings>
  </xsl:template>
</xsl:stylesheet>
