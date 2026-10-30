// Examples from the DataSonnet cookbook (https://datasonnet.github.io/datasonnet-mapper/datasonnet/latest/cookbook.html),
// adjusted where needed to work with datasonnet-mapper 3.0.1.3. Each example is a complete payload plus script;
// inputType/outputType are the media types it needs (default JSON), a script header only sets options for the chosen type.
export const DATASONNET_EXAMPLES = [
  {
    label: 'Single field to single field',
    detail: 'Velden één-op-één hernoemen',
    payload: { userId: 123, name: 'DataSonnet' },
    script: `{
  "uid": payload.userId,
  "uname": payload.name,
}`
  },
  {
    label: 'Multiple fields to single field',
    detail: 'Velden combineren met +',
    payload: { userId: 123, name: 'DataSonnet', number1: 1, number2: 2, object1: { a: 1 }, object2: { b: 2 }, array1: [1], array2: [2], array3: [3] },
    script: `{
  "nameId": payload.name + " - " + payload.userId,
  "numberPlusString" : payload.number1 + payload.name,
  "stringPlusNumber" : payload.name + payload.number1,
  "numberPlusNumber" : payload.number1 + payload.number2,
  "objects" : payload.object1 + payload.object2,
  "arrays" : payload.array1 +
             payload.array2 +
             payload.array3
}`
  },
  {
    label: 'Conditional mapping',
    detail: 'Array splitsen met if in een comprehension',
    payload: [{ name: 'Joe', gender: 'M', insurance: true }, { name: 'Jane', gender: 'F' }],
    script: `{
  "insured" : [
    {
      name: person.name,
      gender: person.gender
    }
    for person in payload
    if std.objectHas(person, "insurance") &&
       person.insurance == true
  ],
  "uninsured" : [
    {
      name: person.name,
      gender: person.gender
    }
    for person in payload
    if !std.objectHas(person, "insurance") ||
       person.insurance == false
  ]
}`
  },
  {
    label: 'Validation: error',
    detail: 'Transformatie afbreken met een foutmelding',
    payload: { name: 'DataSonnet' },
    script: `if std.objectHas(payload, "name") then payload.name else error "name ontbreekt"`
  },
  {
    label: 'Validation: assert',
    detail: 'Controle op een veld van het resultaat',
    payload: { f: 10 },
    script: `{
  f: payload.f,
  assert self.f == 10 : "f moet 10 zijn"
}`
  },
  {
    label: 'Array index selector',
    detail: 'Deel van een array selecteren (slice)',
    payload: ['a', 'b', 'c', 'd'],
    script: `{
    slice1: payload[0 : 2],
    slice2: payload[2 : 2],
    slice3: payload[1 : 10]
}`
  },
  {
    label: 'Looping',
    detail: 'Over een array lopen met for',
    payload: ['a', 'b', 'c'],
    script: `[
    {
        letter: x
    } for x in payload
]`
  },
  {
    label: 'Looping with index',
    detail: 'Over een array lopen met index (std.mapWithIndex)',
    payload: { flights: ['KL1001', 'KL1002'] },
    script: `std.mapWithIndex(function(index, value)
                 {
                     "index": index,
                     "value": value
                 }, payload.flights)`
  },
  {
    label: 'Filter by',
    detail: 'Array filteren (std.filter)',
    payload: [{ name: 'Joe', insurance: true }, { name: 'Bob' }],
    script: `local isInsured(person) = std.objectHas(person, "insurance") &&
                          person.insurance == true;

{
    "insured" : std.filter(function(person) isInsured(person), payload)
}`
  },
  {
    label: 'Order by',
    detail: 'Array sorteren (std.sort)',
    payload: [3, 4, 5, 6, 7, 1, 2],
    script: `std.sort(payload)`
  },
  {
    label: 'Group by',
    detail: 'Array groeperen (ds.groupBy)',
    payload: { languages: [{ language: { name: 'Java', version: '1.8' } }, { language: { name: 'Scala', version: '2.13.0' } }, { language: { name: 'Java', version: '1.7' } }] },
    script: `{
  languages: ds.groupBy(payload.languages, function(x) x.language.name),
}`
  },
  {
    label: 'Distinct by',
    detail: 'Dubbele waarden verwijderen (ds.distinctBy)',
    payload: { arrayOfLetters: ['a', 'c', 'b', 'a', 'd'], arrayOfObjects: [{ a: 1 }, { a: 1 }, { b: 2 }] },
    script: `{
  uniqueLetters: ds.distinctBy(payload.arrayOfLetters, function(x) x),
  uniqueObjects: ds.distinctBy(payload.arrayOfObjects, function(x) x)
}`
  },
  {
    label: 'Count',
    detail: 'Aantal elementen (std.length)',
    payload: ['a', 'b', 'c'],
    script: `{
  count: std.length(payload)
}`
  },
  {
    label: 'Array flattening',
    detail: 'Geneste arrays platslaan (ds.arrays.deepFlatten)',
    payload: [[1, [2, [3]]], [4, 5], 6, 7, { x: 'y' }],
    script: `ds.arrays.deepFlatten(payload)`
  },
  {
    label: 'Sum up numbers in an array',
    detail: 'Getallen optellen (std.foldl)',
    payload: [10, 20, 28],
    script: `{
  sum: std.foldl(function(aggregate, num) aggregate + num, payload, 0)
}`
  },
  {
    label: 'Default values',
    detail: 'Ontbrekende velden aanvullen',
    payload: [{ name: 'Jan' }, { company: 'WeAreFrank!' }],
    script: `local defaultValues = {
    "name": "No Name",
    "company": "N/A"
};

std.map(function(obj) defaultValues + obj, payload)`
  },
  {
    label: 'Add and subtract dates',
    detail: 'Periode bij een datum optellen (ds.datetime)',
    payload: {},
    script: `// Parse a datetime string and add a period
local dt = ds.datetime.parse("2019-07-22T21:00:00+00:00");
dt.plus("P1Y1D").toISO()`
  },
  {
    label: 'Creating a pivot table',
    detail: 'Velden van objecten verzamelen in arrays',
    payload: [{ name: 'Jan', company: 'A' }, { company: 'B' }],
    script: `local overlay = {
  "name": "No Name",
  "company": "N/A"
};

local payloadWithDefaults = std.map(function(obj) overlay + obj, payload);

{
  names: std.foldl(function(aggregate, obj) aggregate + [obj.name], payloadWithDefaults, []),
  companies: std.foldl(function(aggregate, obj) aggregate + [obj.company], payloadWithDefaults, []),
}`
  },
  {
    label: 'Removing fields from object',
    detail: 'Velden weglaten met een object comprehension',
    payload: { id: 1, name: 'Jan', photo: 'x', disabled: false },
    script: `local removeFields = [ "photo", "generic", "disabled", "update_whitelist", "id" ];

{
    [ if std.count(removeFields, k) <= 0 then k else null ] : payload[k]
    for k in std.objectFields(payload)
}`
  },
  {
    label: 'Removing fields with ds.remove',
    detail: 'Velden weglaten (ds.remove)',
    payload: { id: 1, name: 'Jan', photo: 'x', disabled: false },
    script: `ds.remove(payload, [ "photo", "generic", "disabled", "update_whitelist", "id" ])`
  },
  {
    label: 'Finding if array contains value',
    detail: 'Zoeken met JSONPath (ds.jsonpath.select)',
    payload: { languages: [{ language: { name: 'Java' } }, { language: { name: 'Scala' } }] },
    script: `local javaLanguages = ds.jsonpath.select(payload, "$..language[?(@.name == 'Java')]");

std.length(javaLanguages) > 0`
  },
  {
    label: 'Merging objects and adding fields',
    detail: 'Objecten samenvoegen met +',
    payload: { firstName: 'Jan', addresses: [{ city: 'Utrecht' }] },
    script: `payload + { "middleName": "NMN",
            "addresses": [
              addr + { "state": "CA" } for addr in payload.addresses
            ]
          }`
  },
  {
    label: 'Reading XML',
    detail: 'XML-payload lezen met namespace-scheiding en tekstsleutel',
    payload: '<test:root xmlns:test="http://www.modusbox.com"><test:datasonnet>Hello World</test:datasonnet></test:root>',
    inputType: 'application/xml',
    script: `/** DataSonnet
version=2.0
input payload application/xml; NamespaceSeparator="_"; TextValueKey="__text"
*/

{
  greeting: payload.test_root.test_datasonnet.__text
}`
  },
  {
    label: 'Writing XML',
    detail: 'XML-output met namespace en attributen',
    payload: {},
    outputType: 'application/xml',
    script: `/** DataSonnet
version=2.0
output application/xml; NamespaceDeclarations.datasonnet="http://www.modusbox.com"; NamespaceSeparator="%"; TextValueKey="__text"; AttributeCharacter="*"
*/

{
    "datasonnet%root": {
        "*xmlns": {
            "datasonnet": "http://www.modusbox.com"
        },
        "datasonnet%datasonnet": {
            "*version": "1.0",
            "__text": "Hello World"
        }
    }
}`
  },
  {
    label: 'Reading CSV',
    detail: 'CSV met kopregel lezen',
    payload: 'first_name,last_name,email\nJan,Jansen,jan@example.com',
    inputType: 'text/csv',
    script: `{
  firstPerson: {
    firstName: payload[0]["first_name"],
    lastName: payload[0].last_name,
    email: payload[0].email
  }
}`
  },
  {
    label: 'Reading CSV without header',
    detail: 'CSV zonder kopregel met | als scheidingsteken',
    payload: 'Jan|Jansen|jan@example.com',
    inputType: 'text/csv',
    script: `/** DataSonnet
version=2.0
input payload text/csv; UseHeader=false; Separator="|"
*/

{
  firstPerson: {
    firstName: payload[0][0],
    lastName: payload[0][1],
    email: payload[0][2]
  }
}`
  },
  {
    label: 'Writing CSV',
    detail: 'CSV-output zonder kopregel met eigen quote en scheidingsteken',
    payload: {},
    outputType: 'text/csv',
    script: `/** DataSonnet
version=2.0
output text/csv; UseHeader=false; Quote="'"; Separator="|"
*/
[
  [
    "William",
    "Shakespeare",
    "Hamlet"
  ],
  [
    "Christopher",
    "Marlowe",
    "Doctor Faustus"
  ]
]`
  }
];
