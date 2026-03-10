# The design of the FMI2/FMI3 models

These models are unusual, in that they are partly intended to define the correct semantics of [FMU](https://fmi-standard.org/) `modelDescription.xml` files, and partly intended to support a tool which analyses such XML files and lists all of the problems encountered.

The XML types are defined in an XSD schema, which in turn is represented naturally in VDM using record types. For example, the top level XML `<xs:element name="fmiModelDescription"> ...` is represented by a VDM record type `FmiModelDescription :: ...`. An automatic tool was developed, called `xsd2vdm`, which processes the XSD to create the VDM record equivalents; the tool also converts XML documents that conform to the XSD into VDM record values which conform to the VDM schema, for example declaring `mk_FmiModelDescription(...)` constant values.

This is an elegant conversion from XSD/XML to VDM-SL, and the obvious way to define the FMU static semantic rules is to add invariants to the VDM types that enforce the rules from the FMI Standard. However, this approach means that a model which includes a non-conformant XML file translation would simply fail at initialization with an invariant failure. That is unlikely to be helpful, and it also fails on the first error rather than reporting all of the issues with the XML file.

So the following approach was taken:

- The VDM record types created by `xsd2vdm` do not have type invariants. This allows them to represent XML files that are non-conformant.
- Each VDM record type has a twin, with an apostrophe in its name, which is equal to the unchecked type, but with the addition of an invariant.
- The record invariants explicitly call the invariant functions of their constituent record types, and collect the boolean results into a seq of bool.
- A helper function called `allOf([...])` asserts that every element in the sequence is true.
- In addition to calling the invariants of their constituent fields, an invariant may also include several `validXXX(...)` rule functions, which check the validity of particular fields in the record (typically those that require consistency between field values, or which do not have subfields).

For example:
```
types
	UnitDefinitions' = [UnitDefinitions]
	inv units == units <> nil => allOf
	([
		invs_Unit'(units),

		-- Rules are defined in UnitDefinitions.vdmsl in Rules folder
		validUnitNames(units)
	]);

	Unit' = Unit
	inv unit == allOf
	([
		invs_DisplayUnit'(unit.displayUnit),
		inv_BaseUnit'(unit.baseUnit),

		-- Rules are defined in UnitDefinitions.vdmsl in Rules folder
		validDisplayUnitNames(unit)
	]);

functions
	-- A helper function to call inv_Unit' on a set or sequence of Units.
	invs_Unit': [ set of Unit | seq of Unit ] +> bool
	invs_Unit'(args) ==
		apply[Unit](inv_Unit', args);

	-- @DocLink("<FMI2_STANDARD> Section 2.2.2, Page 35")
	validUnitNames: UnitDefinitions +> bool
	validUnitNames(units) ==
		-- @OnFail("%NAME: Unit names must be unique")
		( let names = [ u.name | u in seq units ] in
			len names = card elems names );

	-- @DocLink("<FMI2_STANDARD> Section 2.2.2, Page 35")
	validDisplayUnitNames: Unit +> bool
	validDisplayUnitNames(unit) ==
		unit.displayUnit <> nil =>
			-- @OnFail("%NAME: DisplayUnit names must be unique within %s at %#s",
			-- unit.name, loc2str(unit.location))
			( let names = [ u.name | u in seq unit.displayUnit ] in
				len names = card elems names );

```
Here, the `UnitDefinitions'` type is an (optional) copy of the unchecked type `UnitDefinitions`, but with an invariant. The invariant is an `allOf` that includes a check of the `units` field (using an `invs_Unit'` helper), plus a `validUnitNames` rule which checks that the names in the units are unique. The "invs" helper calls `inv_Unit'` on each of the Units passed, and that in turn checks the display unit and base unit, as well as checking the display unit names are unique using `validDisplayUnitNames`.

The "primed" types are in VDM sources at the top level of the model. The unchecked types are automatically generated in FMI2Schema.vdmsl. The validation rules are in files of the same name as their type, under the Rules folder.

Note that the rule functions include two annotations, `@DocLink` and `@OnFail`. These work together, so that whenever a boolean sub-expression in a validation function fails (returns false), the messages are printed, but the evaluation continues. In this way, the tree of invariants and `allOf` calls spans the entire XML structure, reporting all of the validation errors, giving `@DocLink` references to the FMI Standard where the rule is defined, and ultimately returning false to indicate that the FMU configuration is not valid. The output looks like this:
```
validAliasNames: Warning: aliases of reference mk_AliasTag(16777218, <Real>) must all be <tunable>, because of "constantVoltage.V"
<FMI2_STANDARD> Section 2.2.7, Page 46
validAliasNames: Warning: aliases of reference mk_AliasTag(100663309, <Real>) must all be <continuous>
<FMI2_STANDARD> Section 2.2.7, Page 46
validAliasNames: Aliases of reference mk_AliasTag(335544321, <Real>) must all have same unit/baseUnits
<FMI2_STANDARD> Section 2.2.7, Page 46
```

One would expect the `<FMI2_STANDARD>` to be substituted for the URL of the actual standard, such as https://fmi-standard.org/docs/3.0.2/ (for FMI3). The FMI3 model's `@DocLinks` include anchors to go directly to the right part of the FMI Standard.

Finally, a top level function chooses which of the three possible top-level invariants to call, to start the validation process. The `validationError` global is set to an error message by the `xsd2vdm` tool if the XML supplied does not conform to the XSD or has a fundamental parsing error.
```
	isValidFMIConfigurations: [FmiModelDescription] * [FmiBuildDescription] * [FmiTerminalsAndIcons] +> bool
	isValidFMIConfigurations(model, build, terminals) == allOf
	([
		validationError <> nil => /* @Printf("%#s\n", validationError) */ false,
		
		model <> nil => inv_FmiModelDescription'(model),
		build <> nil => inv_FmiBuildDescription'(build),
		terminals <> nil => inv_FmiTerminalsAndIcons'(mk_(terminals, model))
	]);
```

