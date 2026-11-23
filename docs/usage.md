# Using the tools

The application has three pages, selectable from the navigation in the header: **XSLT**, **DataSonnet** and **JSONata**. Each page has panels for parameters and input, a transform editor, and output with a **Console** below it. Select **Transform** or press **Ctrl+Enter** to run. Select **Help** in the header for the in-app guide.

Everything you type is saved automatically in this browser (browser-local storage, separate per page) and restored when you return to the same address. It survives container restarts but is not shared with other browsers or computers. Transformation output is not saved. Use the ☀/🌙 button on the right of the header to switch between dark and light mode.

## XSLT

Runs XSLT transformations with Saxon-HE, and validates XML against an XSD.

1. Replace the sample XML in **Input XML**, or select **XML openen** to load one or more local XML files. When multiple files are loaded, use the tabs to switch the active input.
2. Replace the sample stylesheet in **XSLT**, or select **XSLT openen** to load a local `.xsl` or `.xslt` file.
3. Add, change, or remove stylesheet parameters in the **Parameters** panel. A parameter name should match an `xsl:param` name in your stylesheet. Select the arrow beside a parameter to add it as a global `<xsl:param name="..."/>` declaration.
4. Select **Transform** or press **Ctrl+Enter**. The previous output is cleared when a new transformation starts.
5. Read the result in **Output**. Success messages, errors, and `xsl:message` output appear in the **Console**; XSD validation details stay with the XML panel.

The tool starts with example XML, an XSLT 3.0 stylesheet, and a `greeting` parameter. In the playground mode you can also load ready-made examples, and **Map openen** (Chrome/Edge) opens a folder with `.xsl` and `.xml` files for direct editing.

### Editor assistance

The XML editor suggests element and attribute names from the active input. In the XSLT editor, press **Ctrl+Space** or select **Elementen & functies** for common XSLT elements and XPath functions.

Right-click a position in the XML editor and choose **Copy XPath** to copy an XPath for the element at that location. Unique elements are not numbered; repeated siblings use a unique attribute predicate when possible (for example, `adres[@type="woon"]`), and otherwise a numeric index. On an attribute, the XPath includes that attribute.

Right-click in the XSLT editor to show the relevant context action:

- **Highlight XML scope** is available inside non-parameter `select` or `match` expressions and marks the selected XML elements. It uses the browser's XPath 1.0 evaluator, so XPath 2.0/3.0-specific expressions are not supported. Use **Clear XML scope highlight** in the XML editor's context menu to remove the marks.
- **Highlight parameter input** is available on parameter declarations or `$parameter` references (for example `$greeting`). If the parameter has no matching entry in the Parameters panel, the tool reports whether the XSLT's default value will be used.

### Debug with xsl:message

Write values to the **Console** with `xsl:message`. The text appears as a yellow line and the transformation output is not affected.

```xml
<xsl:message terminate="no">
  <xsl:value-of select="persoon/achternaam"/>
</xsl:message>
```

In XSLT 3.0 you can write the expression in curly braces, but only when text value templates are enabled with `expand-text="yes"` (on `xsl:stylesheet` or on the `xsl:message` itself):

```xml
<xsl:stylesheet version="3.0" expand-text="yes" ...>
  ...
  <xsl:message terminate="no">
    {persoon/achternaam}
  </xsl:message>
```

Without `expand-text="yes"` the braces are not evaluated and the Console shows the literal text.

Tips:

- Add a label to recognise the line: `<xsl:message>achternaam: <xsl:value-of select="persoon/achternaam"/></xsl:message>`.
- `terminate="yes"` stops the transformation at that point and shows the message as an error, which helps to find out whether a template is reached at all.
- Place a message in a template or `xsl:for-each` to see the value for every element.
- Print `count(...)` or `exists(...)` to check what an XPath expression selects. An empty line means nothing was selected.
- Remove the messages when you are done: Frank!Framework writes them to its log too.

### Validate XML with XSD

1. Enable **Generate & validate XSD** above the input editor.
2. The tool creates a starter XSD from the current input XML and validates the XML against it.
3. Edit the XSD as needed. Validation updates as you edit the XML or schema.
4. Use **Generate from XML** to replace the current schema with a newly generated one.

The generated XSD is inferred from the current XML sample. Review it before relying on it to describe all valid documents.

### Choose a Saxon version

Select the **⚙** settings link in the top-right corner (it shows the Saxon version on the XSLT page) to open the centered settings page. There you can switch the DataSonnet and JSONata tabs off and choose an available Saxon-HE version. Frank!Framework works with Saxon-HE 10.9, 11.7 and 12.5; only 10.9 is included by default, and it is also the default of this tool. Your choice is saved in this browser. The Docker image includes Saxon-HE 9.9.1-8, 10.9, 11.7, and 12.5.

## DataSonnet

Runs [DataSonnet](https://datasonnet.github.io/datasonnet-mapper/) mappings on the server, using datasonnet-mapper 3.0.1.3, the same version as Frank!Framework.

1. Paste the input in **Payload**, or select **Payload openen**. Choose its format (JSON, XML, CSV, YAML or text) in the list beside the title.
2. Paste a script in **DataSonnet**, or select **Script openen**. The input is available in the script as `payload`.
3. Add parameters with **+**. Each parameter is available in the script as a variable with the same name, for example `greeting`.
4. Choose the output format and select **Transform**.

Notes:

- A header in the script, such as `/** DataSonnet version=2.0 input payload text/csv; Separator="|" */`, only sets options for the format already chosen in the list; its media type must match that choice.
- **Voorbeeld laden…** loads an example from the [DataSonnet cookbook](https://datasonnet.github.io/datasonnet-mapper/datasonnet/latest/cookbook.html), replacing both payload and script and setting the format lists.
- Parameter type **Automatisch** works like the Frank!Framework `DataSonnetPipe`: a value starting with `{` or `[` becomes JSON, one starting with `<` becomes XML, anything else text. Use **JSON** for numbers and booleans, and **Tekst** to pass JSON- or XML-like values as a string. XML text content is under `["$"]`, for example `klant.root.naam["$"]`.
- XML output must be an object with exactly one root element.
- With a JSON payload, right-click and choose **Copy path** to copy the DataSonnet path (for example `payload.persons[1].name`). Right-click a reference such as `payload.persons` or a parameter name in the script and choose **Highlight referentie in payload/parameter** to mark the places it points to; variables from `for p in payload.persons` and `local x = payload.a` are followed. References through functions such as `std.map` are not traced. **Clear highlight** removes the marks.

## JSONata

Evaluates [JSONata](https://jsonata.org/) expressions against JSON. This runs entirely in the browser; no server is needed.

1. Paste JSON in **Input JSON**, or select **Input openen**.
2. Write an expression in **JSONata**. The input is the context of the expression.
3. Add parameters with **+**. A parameter is available in the expression as `$name`. A value that is valid JSON is passed as JSON, otherwise as text.
4. Select **Transform** or press **Ctrl+Enter**.

**Voorbeeld laden…** replaces input, expression and parameters with a working example. Save your own work first if you want to keep it.
