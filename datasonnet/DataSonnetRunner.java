import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import com.datasonnet.Mapper;
import com.datasonnet.MapperBuilder;
import com.datasonnet.document.DefaultDocument;
import com.datasonnet.document.Document;
import com.datasonnet.document.MediaType;
import com.datasonnet.document.MediaTypes;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Usage: DataSonnetRunner <dir> <input media type> <output media type> [name type value ...]
 * Reads script.ds and payload from <dir>, passes each parameter as a named input and writes the result to stdout.
 * Parameter type 'auto' mimics the Frank!Framework DataSonnetPipe, which computes the media type of each parameter value.
 */
public class DataSonnetRunner {
	public static void main(String[] args) throws Exception {
		Path directory = Path.of(args[0]);
		String script = Files.readString(directory.resolve("script.ds"));
		String payload = Files.readString(directory.resolve("payload"));

		Map<String, Document<?>> inputs = new LinkedHashMap<>();
		for (int i = 3; i + 2 < args.length; i += 3) {
			inputs.put(args[i], new DefaultDocument<>(args[i + 2], parameterMediaType(args[i + 1], args[i + 2])));
		}

		PrintStream out = new PrintStream(System.out, true, StandardCharsets.UTF_8);
		DefaultDocument<String> input = new DefaultDocument<>(payload, MediaType.valueOf(args[1]));
		Mapper mapper = null;
		try {
			mapper = new MapperBuilder(script).withInputNames(inputs.keySet()).build();
			out.print(mapper.transform(input, inputs, MediaType.valueOf(args[2])).getContent());
		} catch (Exception e) {
			String message = e.getMessage() != null ? e.getMessage() : e.toString();
			if (mapper != null && args[2].contains("xml")) {
				String explanation = explainXmlError(mapper, input, inputs);
				if (explanation != null) message = explanation + "\n\nOorspronkelijke melding: " + message;
			}
			new PrintStream(System.err, true, StandardCharsets.UTF_8).println(message);
			System.exit(1);
		}
	}

	/**
	 * The DataSonnet XML writer only accepts an object with exactly one field (the root element) whose value is an object,
	 * and fails with cryptic messages otherwise. Re-runs the script with JSON output to find out which rule is broken.
	 */
	private static String explainXmlError(Mapper mapper, Document<?> input, Map<String, Document<?>> inputs) {
		JsonNode result;
		try {
			result = new ObjectMapper().readTree(mapper.transform(input, inputs, MediaTypes.APPLICATION_JSON).getContent());
		} catch (Exception e) {
			return null;
		}

		String rule = "Voor XML-output moet het resultaat een object zijn met precies één veld (het root-element), en de waarde daarvan moet ook een object zijn.";
		if (!result.isObject()) {
			return rule + "\nHet resultaat is nu " + describe(result) + ". Pak het in, bijvoorbeeld: { root: { item: <resultaat> } }";
		}
		if (result.size() != 1) {
			List<String> names = new ArrayList<>();
			result.fieldNames().forEachRemaining(names::add);
			return rule + "\nHet resultaat heeft nu " + result.size() + " velden op het hoogste niveau (" + String.join(", ", names) + "). Pak ze in, bijvoorbeeld: { root: <resultaat> }";
		}
		String rootName = result.fieldNames().next();
		JsonNode root = result.get(rootName);
		if (!root.isObject()) {
			return rule + "\nHet root-element '" + rootName + "' is nu " + describe(root) + ". Maak er een object van, bijvoorbeeld: { " + rootName + ": { item: <waarde> } }";
		}
		String path = findNestedArray(root, rootName);
		if (path != null) {
			return "XML kent geen array direct in een array. Op '" + path + "' staat een array met daarin weer een array. Pak de binnenste array in een object, bijvoorbeeld: [ { item: <array> } ]";
		}
		return null;
	}

	private static String findNestedArray(JsonNode node, String path) {
		if (node.isArray()) {
			for (JsonNode child : node) {
				if (child.isArray()) return path;
				String found = findNestedArray(child, path);
				if (found != null) return found;
			}
		} else if (node.isObject()) {
			var fields = node.fields();
			while (fields.hasNext()) {
				var field = fields.next();
				String found = findNestedArray(field.getValue(), path + "." + field.getKey());
				if (found != null) return found;
			}
		}
		return null;
	}

	private static String describe(JsonNode node) {
		if (node.isArray()) return "een array";
		if (node.isTextual()) return "een tekst";
		if (node.isNumber()) return "een getal";
		if (node.isBoolean()) return "een boolean";
		if (node.isNull()) return "null";
		return "een object";
	}

	private static MediaType parameterMediaType(String type, String value) {
		switch (type) {
			case "json": return MediaTypes.APPLICATION_JSON;
			case "xml": return MediaTypes.APPLICATION_XML;
			case "text": return MediaTypes.TEXT_PLAIN;
			default:
				String content = value.strip();
				if (content.startsWith("{") || content.startsWith("[")) return MediaTypes.APPLICATION_JSON;
				if (content.startsWith("<")) return MediaTypes.APPLICATION_XML;
				return MediaTypes.TEXT_PLAIN;
		}
	}
}
