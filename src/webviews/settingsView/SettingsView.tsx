// SPDX-License-Identifier: GPL-3.0-or-later

import React, { useEffect, useMemo, useState } from "react";
import {
    VSCodeButton,
    VSCodeCheckbox,
    VSCodeDivider,
    VSCodeDropdown,
    VSCodeOption,
    VSCodeTextField,
} from "@vscode/webview-ui-toolkit/react";
import { VSCodeAPI } from "../shared.types";

// Types

type SettingValue = boolean | string | number | string[] | null | undefined;

interface Settings {
    [key: string]: SettingValue;
}

interface SettingsViewProps {
    vscodeApi: VSCodeAPI;
}

type TabId = "general" | "vdmj" | "launch" | "plugins";

interface Tab {
    id: TabId;
    label: string;
}

const TABS: Tab[] = [
    { id: "general", label: "General" },
    { id: "vdmj", label: "VDMJ" },
    { id: "launch", label: "Launch" },
    { id: "plugins", label: "Plugins" },
];

// Shared styles
const sharedStyles = {
    groupTitle: {
        fontSize: "11px",
        fontWeight: 700,
        textTransform: "uppercase" as const,
        letterSpacing: "0.08em",
        color: "var(--vscode-descriptionForeground)",
        marginBottom: "8px",
    } as React.CSSProperties,
    fieldRow: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "8px 0",
        gap: "16px",
    } as React.CSSProperties,
    fieldLabel: {
        fontSize: "12px",
        color: "var(--vscode-foreground)",
        fontWeight: 600,
        flex: "1 1 0",
    } as React.CSSProperties,
    modifiedDot: {
        width: "6px",
        height: "6px",
        borderRadius: "50%",
        background: "var(--vscode-focusBorder)",
        display: "inline-block",
        flexShrink: 0,
    } as React.CSSProperties,
};

// Shared components

const FieldRow = ({
    label,
    subtitle,
    description,
    modified,
    children,
}: {
    label: string;
    subtitle?: string;
    description?: string;
    modified?: boolean;
    children: React.ReactNode;
}) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "10px 0", gap: "16px" }}>
        <div style={{ flex: "1 1 0", minWidth: 0 }}>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--vscode-foreground)", marginBottom: "2px", display: "flex", alignItems: "center", gap: "6px" }}>
                {label}
                {modified && <span title="Modified from default" style={sharedStyles.modifiedDot} />}
            </div>
            {subtitle && <div style={{ fontSize: "11px", color: "var(--vscode-descriptionForeground)", fontFamily: "var(--vscode-editor-font-family)", marginBottom: "2px" }}>{subtitle}</div>}
            {description && <div style={{ fontSize: "12px", color: "var(--vscode-descriptionForeground)" }}>{description}</div>}
        </div>
        <div style={{ flexShrink: 0, display: "flex", alignItems: "center" }}>
            {children}
        </div>
    </div>
);

const CollapsibleSection = ({
    label = "Advanced",
    forceOpen,
    marginTop = "16px",
    children,
}: {
    label?: string;
    forceOpen?: boolean;
    marginTop?: string;
    children: React.ReactNode;
}) => {
    const [open, setOpen] = useState(false);
    const isOpen = forceOpen || open;

    return (
        <div style={{ marginTop }}>
            <button
                onClick={() => setOpen((o) => !o)}
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--vscode-descriptionForeground)",
                    fontSize: "12px",
                    fontWeight: 600,
                    padding: "4px 0",
                }}
            >
                <span className={`codicon codicon-chevron-${isOpen ? "down" : "right"}`} />
                {label}
            </button>
            {isOpen && <div style={{ marginTop: "8px" }}>{children}</div>}
        </div>
    );
};

// Setting descriptors

interface SettingDescriptorBase {
    key: string;
    label: string;
    description: string;
    group: string;
}

interface BooleanSetting extends SettingDescriptorBase {
    type: "boolean";
    default: boolean;
}

interface StringSetting extends SettingDescriptorBase {
    type: "string";
    default: string;
}

interface EnumSetting extends SettingDescriptorBase {
    type: "enum";
    options: { value: string; label: string }[];
    default: string;
}

interface NumberSetting extends SettingDescriptorBase {
    type: "number";
    default: number;
    min?: number;
    max?: number;
}

type SettingDescriptor = BooleanSetting | StringSetting | EnumSetting | NumberSetting;

interface SchemaEntry {
    type: string;
    title: string;
    description: string;
    default: unknown;
    enum: string[] | null;
    minimum: number | null;
    maximum: number | null;
    group: string;
    advanced: boolean;
}

interface VdmjSchemaEntry {
    type: "boolean" | "number" | "string";
    title: string;
    description: string;
    category: string;
    advanced: boolean;
    default: string;
}

interface LaunchConfig {
    name: string;
    type: string;
    request: string;
    noDebug?: boolean;
    defaultName?: string;
    trace?: boolean;
    command?: string;
    remoteControl?: string;
    enableLogging?: boolean;
    settings?: Record<string, unknown>;
    properties?: Record<string, unknown>;
    params?: Record<string, unknown>;
}

interface LaunchSnippet {
    label: string;
    description: string;
    body: LaunchConfig;
}

interface JsonSchemaProperty {
    type: "string" | "integer" | "number" | "boolean";
    title?: string;
    description?: string;
    default?: unknown;
    enum?: string[];
}

interface PluginSchema {
    plugin: string;
    schema: {
        properties: Record<string, JsonSchemaProperty>;
    };
}

// Tab bar

const TabBar = ({ activeTab, onSelect }: { activeTab: TabId; onSelect: (tab: TabId) => void }) => {
    const barStyle: React.CSSProperties = {
        display: "flex",
        flexDirection: "row",
        borderBottom: "1px solid var(--vscode-panel-border)",
        marginBottom: "24px",
    };

    const tabStyle = (active: boolean): React.CSSProperties => ({
        padding: "8px 16px",
        fontSize: "13px",
        fontWeight: active ? 600 : 400,
        color: active ? "var(--vscode-foreground)" : "var(--vscode-descriptionForeground)",
        cursor: "pointer",
        background: "none",
        border: "none",
        borderBottom: active ? "2px solid var(--vscode-focusBorder)" : "2px solid transparent",
        marginBottom: "-1px",
    });

    return (
        <div style={barStyle}>
            {TABS.map((tab) => (
                <button key={tab.id} style={tabStyle(activeTab === tab.id)} onClick={() => onSelect(tab.id)}>
                    {tab.label}
                </button>
            ))}
        </div>
    );
};

// Placeholder for unimplemented tabs

const ComingSoonTab = ({ label }: { label: string }) => (
    <div
        style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "200px",
            gap: "8px",
            color: "var(--vscode-descriptionForeground)",
        }}
    >
        <span className="codicon codicon-tools" style={{ fontSize: "32px" }} />
        <span style={{ fontSize: "14px" }}>{label} settings - coming soon</span>
    </div>
);

// General tab sub-components

const SettingRow = ({
    descriptor,
    value,
    onChange,
    vscodeApi,
    modified,
}: {
    descriptor: SettingDescriptor;
    value: SettingValue;
    onChange: (key: string, value: SettingValue) => void;
    vscodeApi: VSCodeAPI;
    modified: boolean;
}) => {
    const renderControl = () => {
        switch (descriptor.type) {
            case "boolean":
                return (
                    <VSCodeCheckbox
                        checked={value === true}
                        onChange={(e: any) => onChange(descriptor.key, (e.target as HTMLInputElement).checked)}
                    />
                );
            case "enum":
                return (
                    <VSCodeDropdown
                        value={String(value ?? descriptor.default)}
                        onChange={(e: any) => onChange(descriptor.key, e.target.value)}
                        style={{ minWidth: "120px" }}
                    >
                        {descriptor.options.map((opt) => (
                            <VSCodeOption key={opt.value} value={opt.value}>
                                {opt.label}
                            </VSCodeOption>
                        ))}
                    </VSCodeDropdown>
                );
            case "string":
                return (
                    <VSCodeTextField
                        value={String(value ?? descriptor.default)}
                        onInput={(e: any) => onChange(descriptor.key, e.target.value)}
                        style={{ minWidth: "200px" }}
                    />
                );
            case "number":
                return (
                    <VSCodeTextField
                        value={String(value ?? descriptor.default)}
                        onInput={(e: any) => {
                            const n = Number(e.target.value);
                            if (!isNaN(n)) onChange(descriptor.key, n);
                        }}
                        style={{ minWidth: "80px" }}
                    />
                );
            default:
                return (
                    <VSCodeButton
                        appearance="icon"
                        title="Edit in VS Code settings"
                        onClick={() =>
                            vscodeApi.postMessage({
                                command: "openNativeSettings",
                                data: { query: (descriptor as SettingDescriptorBase).key },
                            })
                        }
                    >
                        <span className="codicon codicon-link-external" />
                    </VSCodeButton>
                );
        }
    };

    return (
        <FieldRow label={descriptor.label} description={descriptor.description} modified={modified}>
            {renderControl()}
        </FieldRow>
    );
};

const GroupSection = ({
    group,
    settings,
    values,
    onChange,
    vscodeApi,
    modifiedKeys,
}: {
    group: string;
    settings: SettingDescriptor[];
    values: Settings;
    onChange: (key: string, value: SettingValue) => void;
    vscodeApi: VSCodeAPI;
    modifiedKeys: Set<string>;
}) => (
    <div style={{ marginBottom: "24px" }}>
        <div style={sharedStyles.groupTitle}>{group}</div>
        <VSCodeDivider />
        {settings.map((descriptor, i) => (
            <React.Fragment key={descriptor.key}>
                <SettingRow
                    descriptor={descriptor}
                    value={values[descriptor.key]}
                    onChange={onChange}
                    vscodeApi={vscodeApi}
                    modified={modifiedKeys.has(descriptor.key)}
                />
                {i < settings.length - 1 && <VSCodeDivider role="presentation" />}
            </React.Fragment>
        ))}
    </div>
);

// VDMJ tab

const VdmjPropertyRow = ({
    propKey,
    schema,
    value,
    isModified,
    onChange,
}: {
    propKey: string;
    schema: VdmjSchemaEntry;
    value: string;
    isModified: boolean;
    onChange: (key: string, value: string) => void;
}) => (
    <FieldRow label={schema.title} subtitle={propKey} description={schema.description} modified={isModified}>
        {schema.type === "boolean" ? (
            <VSCodeCheckbox
                checked={value === "true"}
                onChange={(e: any) => onChange(propKey, (e.target as HTMLInputElement).checked ? "true" : "false")}
            />
        ) : (
            <VSCodeTextField
                value={value}
                onInput={(e: any) => onChange(propKey, e.target.value)}
                style={{ minWidth: schema.type === "number" ? "80px" : "200px" }}
            />
        )}
    </FieldRow>
);

const VdmjTab = ({
    values,
    schema,
    onChange,
}: {
    values: Record<string, string>;
    schema: Record<string, VdmjSchemaEntry>;
    onChange: (key: string, value: string) => void;
}) => {
    const [filterText, setFilterText] = useState("");
    const [showModifiedOnly, setShowModifiedOnly] = useState(false);

    const isModified = (key: string) => values[key] !== undefined && values[key] !== schema[key]?.default;

    const matchesFilter = (key: string, entry: VdmjSchemaEntry) => {
        if (showModifiedOnly && !isModified(key)) return false;
        if (!filterText) return true;
        const q = filterText.toLowerCase();
        return key.toLowerCase().includes(q) || entry.description.toLowerCase().includes(q);
    };

    const groupByCategory = (entries: [string, VdmjSchemaEntry][]) =>
        entries.reduce<Record<string, [string, VdmjSchemaEntry][]>>((acc, [key, entry]) => {
            if (!acc[entry.category]) acc[entry.category] = [];
            acc[entry.category].push([key, entry]);
            return acc;
        }, {});

    const allEntries = Object.entries(schema);
    const commonGroups = groupByCategory(allEntries.filter(([k, e]) => !e.advanced && matchesFilter(k, e)));
    const advancedGroups = groupByCategory(allEntries.filter(([k, e]) => e.advanced && matchesFilter(k, e)));
    const forceAdvancedOpen = (filterText.length > 0 || showModifiedOnly) && Object.keys(advancedGroups).length > 0;

    const renderGroup = (category: string, entries: [string, VdmjSchemaEntry][]) => (
        <div key={category} style={{ marginBottom: "24px" }}>
            <div style={sharedStyles.groupTitle}>{category}</div>
            <VSCodeDivider />
            {entries.map(([key, entry], i) => (
                <React.Fragment key={key}>
                    <VdmjPropertyRow
                        propKey={key}
                        schema={entry}
                        value={values[key] ?? entry.default}
                        isModified={isModified(key)}
                        onChange={onChange}
                    />
                    {i < entries.length - 1 && <VSCodeDivider role="presentation" />}
                </React.Fragment>
            ))}
        </div>
    );

    return (
        <div>
            <div style={{ marginBottom: "20px", display: "flex", gap: "8px", alignItems: "center" }}>
                <VSCodeTextField
                    placeholder="Search properties..."
                    value={filterText}
                    onInput={(e: any) => setFilterText(e.target.value)}
                    style={{ flex: 1 }}
                >
                    <span slot="start" className="codicon codicon-search" />
                </VSCodeTextField>
                <VSCodeButton
                    appearance={showModifiedOnly ? "primary" : "secondary"}
                    onClick={() => setShowModifiedOnly((v) => !v)}
                    title="Show only modified properties"
                >
                    <span slot="start" className="codicon codicon-diff-modified" />
                    Modified
                </VSCodeButton>
            </div>

            {Object.entries(commonGroups).map(([category, entries]) => renderGroup(category, entries))}

            <CollapsibleSection forceOpen={forceAdvancedOpen}>
                {Object.entries(advancedGroups).map(([category, entries]) => renderGroup(category, entries))}
            </CollapsibleSection>
        </div>
    );
};

// Launch tab

const FieldToggleRow = ({
    label,
    description,
    enabled,
    onToggle,
    children,
}: {
    label: string;
    description?: string;
    enabled: boolean;
    onToggle: (enabled: boolean) => void;
    children?: React.ReactNode;
}) => (
    <div style={{ padding: "10px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px" }}>
            <div style={{ flex: "1 1 0" }}>
                <div style={{ fontSize: "13px", fontWeight: 600, color: enabled ? "var(--vscode-foreground)" : "var(--vscode-disabledForeground)" }}>
                    {label}
                </div>
                {description && (
                    <div style={{ fontSize: "12px", color: "var(--vscode-descriptionForeground)" }}>{description}</div>
                )}
            </div>
            <VSCodeCheckbox
                checked={enabled}
                onChange={(e: any) => onToggle((e.target as HTMLInputElement).checked)}
            />
        </div>
        {enabled && children && (
            <div style={{ marginTop: "8px" }}>{children}</div>
        )}
    </div>
);

const BlankConfigCard = ({
    onSave,
    onCancel,
    vdmjSchema,
    settingsSchema,
}: {
    onSave: (config: LaunchConfig) => void;
    onCancel: () => void;
    vdmjSchema: Record<string, VdmjSchemaEntry>;
    settingsSchema: Record<string, { description: string }>;
}) => {
    const [name, setName] = useState("New Configuration");
    const [included, setIncluded] = useState<Set<string>>(new Set());

    const defaultSettings = Object.fromEntries(
        Object.entries(settingsSchema).map(([key, def]) => [key, (def as any).default ?? ((def as any).type === "boolean" ? true : 0)])
    );

    const [values, setValues] = useState<Partial<LaunchConfig>>({
        noDebug: false,
        defaultName: undefined,
        command: "",
        remoteControl: "",
        trace: true,
        enableLogging: false,
        settings: defaultSettings,
        properties: {},
        params: {},
    });

    const toggle = (field: string, on: boolean) => {
        setIncluded((prev) => {
            const next = new Set(prev);
            on ? next.add(field) : next.delete(field);
            return next;
        });
        if (["noDebug", "trace", "enableLogging"].includes(field)) {
            setValue(field as keyof LaunchConfig, on);
        }
    };

    const setValue = (field: keyof LaunchConfig, value: any) => {
        setValues((prev) => ({ ...prev, [field]: value }));
    };

    const handleSave = () => {
        const config: LaunchConfig = { name, type: "vdm", request: "launch" };
        for (const field of Array.from(included)) {
            (config as any)[field] = (values as any)[field];
        }
        onSave(config);
    };

    const optionalFields: { key: keyof LaunchConfig; label: string; description: string }[] = [
        { key: "noDebug", label: "No Debug", description: "Don't run in debug mode." },
        { key: "defaultName", label: "Default Name", description: "Name of the default module or class." },
        { key: "trace", label: "Trace", description: "Enable logging of the Debug Adapter Protocol." },
        { key: "command", label: "Command", description: "Run a single execution of a command and terminate." },
        { key: "remoteControl", label: "Remote Control", description: "Delegate control of the interpreter to a remote controller." },
        { key: "enableLogging", label: "Enable Logging", description: "Log real-time events for VDM-RT." },
        { key: "settings", label: "Settings", description: "Configure interpretation checks." },
        { key: "properties", label: "Properties", description: "Override project-wide VDMJ properties for this configuration." },
        { key: "params", label: "Params", description: "Miscellaneous launch parameters." },
    ];

    const renderFieldControl = (field: keyof LaunchConfig) => {
        switch (field) {
            case "noDebug":
            case "trace":
            case "enableLogging":
                return null;
            case "defaultName":
            case "command":
            case "remoteControl":
                return (
                    <VSCodeTextField
                        value={String(values[field] ?? "")}
                        onInput={(e: any) => setValue(field, e.target.value)}
                        style={{ width: "100%" }}
                        placeholder={field === "defaultName" ? "e.g. DEFAULT" : field === "command" ? "e.g. print f()" : "e.g. com.example.Controller"}
                    />
                );
            case "settings": {
                const s = (values.settings ?? {}) as any;
                const booleanFields = Object.entries(settingsSchema).filter(([, v]) => (v as any).type === "boolean");
                return (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px", paddingLeft: "8px" }}>
                        {booleanFields.map(([key]) => (
                            <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span style={{ fontSize: "12px", color: "var(--vscode-foreground)" }}>
                                    {key.replace(/([A-Z])/g, " $1").replace(/^./, c => c.toUpperCase())}
                                </span>
                                <VSCodeCheckbox
                                    checked={s[key] !== false}
                                    onChange={(e: any) => setValue("settings", { ...s, [key]: e.target.checked })}
                                />
                            </div>
                        ))}
                        {settingsSchema["precision"] && (
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span style={{ fontSize: "12px", color: "var(--vscode-foreground)" }}>Precision</span>
                                <VSCodeTextField
                                    value={String(s.precision ?? 100)}
                                    onInput={(e: any) => {
                                        const n = Number(e.target.value);
                                        if (!isNaN(n)) setValue("settings", { ...s, precision: n });
                                    }}
                                    style={{ minWidth: "80px" }}
                                />
                            </div>
                        )}
                    </div>
                );
            }
            case "properties": {
                const props = (values.properties ?? {}) as Record<string, any>;
                return (
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px", paddingLeft: "8px" }}>
                        {Object.entries(vdmjSchema).map(([key, entry]) => (
                            <VdmjPropertyRow
                                key={key}
                                propKey={key}
                                schema={entry}
                                value={props[key] !== undefined ? String(props[key]) : entry.default}
                                isModified={props[key] !== undefined && String(props[key]) !== entry.default}
                                onChange={(k, v) => setValue("properties", { ...props, [k]: v })}
                            />
                        ))}
                    </div>
                );
            }
            case "params": {
                const params = (values.params ?? {}) as Record<string, string>;
                return (
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px", paddingLeft: "8px" }}>
                        {Object.entries(params).map(([k, v], i) => (
                            <div key={i} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                                <VSCodeTextField
                                    value={k}
                                    placeholder="Key"
                                    onInput={(e: any) => {
                                        const updated = { ...params };
                                        delete updated[k];
                                        updated[e.target.value] = v;
                                        setValue("params", updated);
                                    }}
                                    style={{ flex: 1 }}
                                />
                                <VSCodeTextField
                                    value={v}
                                    placeholder="Value"
                                    onInput={(e: any) => setValue("params", { ...params, [k]: e.target.value })}
                                    style={{ flex: 1 }}
                                />
                                <VSCodeButton appearance="icon" onClick={() => {
                                    const updated = { ...params };
                                    delete updated[k];
                                    setValue("params", updated);
                                }}>
                                    <span className="codicon codicon-trash" />
                                </VSCodeButton>
                            </div>
                        ))}
                        <VSCodeButton appearance="secondary" onClick={() => setValue("params", { ...params, "": "" })}>
                            <span slot="start" className="codicon codicon-add" />
                            Add Param
                        </VSCodeButton>
                    </div>
                );
            }
            default:
                return null;
        }
    };

    return (
        <div style={{ marginBottom: "16px", border: "1px solid var(--vscode-focusBorder)", borderRadius: "4px", overflow: "hidden" }}>
            <div style={{ padding: "10px 16px", background: "var(--vscode-editor-background)", borderBottom: "1px solid var(--vscode-panel-border)" }}>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--vscode-foreground)", marginBottom: "8px" }}>
                    New Blank Configuration
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "12px", color: "var(--vscode-foreground)", fontWeight: 600 }}>Name</span>
                    <VSCodeTextField
                        value={name}
                        onInput={(e: any) => setName(e.target.value)}
                        style={{ flex: 1 }}
                    />
                </div>
            </div>

            <div style={{ padding: "0 16px" }}>
                <div style={{ ...sharedStyles.groupTitle, padding: "12px 0 4px", marginBottom: 0 }}>
                    Optional Fields
                </div>
                <VSCodeDivider />
                {optionalFields.map((field, i) => (
                    <React.Fragment key={field.key}>
                        <FieldToggleRow
                            label={field.label}
                            description={field.description}
                            enabled={included.has(field.key)}
                            onToggle={(on) => toggle(field.key, on)}
                        >
                            {renderFieldControl(field.key)}
                        </FieldToggleRow>
                        {i < optionalFields.length - 1 && <VSCodeDivider role="presentation" />}
                    </React.Fragment>
                ))}
            </div>

            <div style={{ padding: "12px 16px", display: "flex", gap: "8px", borderTop: "1px solid var(--vscode-panel-border)" }}>
                <VSCodeButton onClick={handleSave}>
                    <span slot="start" className="codicon codicon-add" />
                    Add Configuration
                </VSCodeButton>
                <VSCodeButton appearance="secondary" onClick={onCancel}>
                    Cancel
                </VSCodeButton>
            </div>
        </div>
    );
};

const LaunchTab = ({
    configs,
    snippets,
    vscodeApi,
    vdmjSchema,
    settingsSchema,
    onSave,
    onCreate,
    onDelete,
}: {
    configs: LaunchConfig[];
    snippets: LaunchSnippet[];
    vscodeApi: VSCodeAPI;
    vdmjSchema: Record<string, VdmjSchemaEntry>;
    settingsSchema: Record<string, { description: string }>;
    onSave: (index: number, config: LaunchConfig) => void;
    onCreate: (config: LaunchConfig) => void;
    onDelete: (index: number) => void;
}) => {
    const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
    const [showSnippetPicker, setShowSnippetPicker] = useState(false);
    const [editingConfigs, setEditingConfigs] = useState<LaunchConfig[]>(configs);
    const [showBlankCard, setShowBlankCard] = useState(false);

    useEffect(() => {
        setEditingConfigs(configs);
    }, [configs]);

    const debounceTimers = React.useRef<Record<string, NodeJS.Timeout>>({});

    const handleFieldChange = (index: number, field: keyof LaunchConfig, value: any) => {
        setEditingConfigs((prev) => {
            const updated = prev.map((c, i) =>
                i === index ? { ...c, [field]: value } : { ...c }
            );
            return updated;
        });

        const timerKey = `${index}-${field}`;
        if (debounceTimers.current[timerKey]) clearTimeout(debounceTimers.current[timerKey]);
        debounceTimers.current[timerKey] = setTimeout(() => {
            setEditingConfigs((prev) => {
                onSave(index, prev[index]);
                return prev;
            });
        }, 300);
    };

    const renderCommonFields = (config: LaunchConfig, index: number) => (
        <>
            <FieldRow label="Name">
                <VSCodeTextField
                    value={config.name}
                    onInput={(e: any) => handleFieldChange(index, "name", e.target.value)}
                    style={{ minWidth: "200px" }}
                />
            </FieldRow>
            <VSCodeDivider role="presentation" />
            <FieldRow label="No Debug" description="Don't run in debug mode.">
                <VSCodeCheckbox
                    checked={config.noDebug === true}
                    onChange={(e: any) => handleFieldChange(index, "noDebug", (e.target as HTMLInputElement).checked)}
                />
            </FieldRow>
            <VSCodeDivider role="presentation" />
            <FieldRow label="Default Name" description="Name of the default module or class.">
                <VSCodeTextField
                    value={config.defaultName ?? ""}
                    onInput={(e: any) => handleFieldChange(index, "defaultName", e.target.value)}
                    style={{ minWidth: "200px" }}
                    placeholder="e.g. DEFAULT"
                />
            </FieldRow>
            <VSCodeDivider role="presentation" />
            <FieldRow label="Command" description="Run a single execution of a command and terminate.">
                <VSCodeTextField
                    value={config.command ?? ""}
                    onInput={(e: any) => handleFieldChange(index, "command", e.target.value)}
                    style={{ minWidth: "200px" }}
                    placeholder="e.g. print f()"
                />
            </FieldRow>
            <VSCodeDivider role="presentation" />
            <FieldRow label="Remote Control" description="Delegate control of the interpreter to a remote controller.">
                <VSCodeTextField
                    value={config.remoteControl ?? ""}
                    onInput={(e: any) => handleFieldChange(index, "remoteControl", e.target.value)}
                    style={{ minWidth: "200px" }}
                    placeholder="e.g. com.example.Controller"
                />
            </FieldRow>
            <VSCodeDivider role="presentation" />
            <FieldRow label="Enable Logging" description="Log real-time events for VDM-RT.">
                <VSCodeCheckbox
                    checked={config.enableLogging === true}
                    onChange={(e: any) => handleFieldChange(index, "enableLogging", (e.target as HTMLInputElement).checked)}
                />
            </FieldRow>
        </>
    );

    const renderSettingsFields = (config: LaunchConfig, index: number) => {
        const s = config.settings ?? {};

        const handleSettingChange = (key: string, value: boolean | number) => {
            handleFieldChange(index, "settings", { ...s, [key]: value });
        };

        const booleanFields = Object.entries(settingsSchema).filter(([, v]) => (v as any).type === "boolean");
        const precisionEntry = settingsSchema["precision"];

        return (
            <div style={{ marginTop: "8px" }}>
                <div style={sharedStyles.groupTitle}>Checks</div>
                <VSCodeDivider />
                {booleanFields.map(([key, def], i) => (
                    <React.Fragment key={key}>
                        <FieldRow label={key.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase())} description={(def as any).description}>
                            <VSCodeCheckbox
                                checked={(s as any)[key] !== false}
                                onChange={(e: any) => handleSettingChange(key, e.target.checked)}
                            />
                        </FieldRow>
                        {i < booleanFields.length - 1 && <VSCodeDivider role="presentation" />}
                    </React.Fragment>
                ))}
                {precisionEntry && (
                    <>
                        <VSCodeDivider role="presentation" />
                        <FieldRow label="Precision" description={(precisionEntry as any).description}>
                            <VSCodeTextField
                                value={String((s as any).precision ?? 100)}
                                onInput={(e: any) => {
                                    const n = Number(e.target.value);
                                    if (!isNaN(n)) handleSettingChange("precision", n);
                                }}
                                style={{ minWidth: "80px" }}
                            />
                        </FieldRow>
                    </>
                )}
            </div>
        );
    };

    const renderPropertiesFields = (config: LaunchConfig, index: number) => {
        const props = (config.properties ?? {}) as Record<string, any>;

        const handlePropChange = (key: string, value: string) => {
            handleFieldChange(index, "properties", { ...props, [key]: value });
        };

        return (
            <div style={{ marginTop: "8px" }}>
                <div style={sharedStyles.groupTitle}>VDMJ Property Overrides</div>
                <VSCodeDivider />
                <div style={{ fontSize: "12px", color: "var(--vscode-descriptionForeground)", padding: "8px 0" }}>
                    These override the project-wide VDMJ properties for this launch configuration only.
                </div>
                {Object.entries(vdmjSchema).map(([key, entry], i, arr) => (
                    <React.Fragment key={key}>
                        <VdmjPropertyRow
                            propKey={key}
                            schema={entry}
                            value={props[key] !== undefined ? String(props[key]) : entry.default}
                            isModified={props[key] !== undefined && String(props[key]) !== entry.default}
                            onChange={handlePropChange}
                        />
                        {i < arr.length - 1 && <VSCodeDivider role="presentation" />}
                    </React.Fragment>
                ))}
            </div>
        );
    };

    const renderParamsFields = (config: LaunchConfig, index: number) => {
        const params = (config.params ?? {}) as Record<string, string>;
        const entries = Object.entries(params);

        const handleParamChange = (oldKey: string, newKey: string, value: string) => {
            const updated = { ...params };
            if (oldKey !== newKey) delete updated[oldKey];
            updated[newKey] = value;
            handleFieldChange(index, "params", updated);
        };

        const handleParamDelete = (key: string) => {
            const updated = { ...params };
            delete updated[key];
            handleFieldChange(index, "params", updated);
        };

        const handleParamAdd = () => {
            handleFieldChange(index, "params", { ...params, "": "" });
        };

        return (
            <div style={{ marginTop: "8px" }}>
                <div style={sharedStyles.groupTitle}>Params</div>
                <VSCodeDivider />
                {entries.length === 0 && (
                    <div style={{ fontSize: "12px", color: "var(--vscode-descriptionForeground)", padding: "8px 0" }}>
                        No params defined.
                    </div>
                )}
                {entries.map(([key, value], i) => (
                    <div key={i} style={{ display: "flex", gap: "8px", alignItems: "center", padding: "6px 0" }}>
                        <VSCodeTextField
                            value={key}
                            placeholder="Key"
                            onInput={(e: any) => handleParamChange(key, e.target.value, value)}
                            style={{ flex: 1 }}
                        />
                        <VSCodeTextField
                            value={value}
                            placeholder="Value"
                            onInput={(e: any) => handleParamChange(key, key, e.target.value)}
                            style={{ flex: 1 }}
                        />
                        <VSCodeButton appearance="icon" onClick={() => handleParamDelete(key)}>
                            <span className="codicon codicon-trash" />
                        </VSCodeButton>
                    </div>
                ))}
                <VSCodeButton appearance="secondary" onClick={handleParamAdd} style={{ marginTop: "8px" }}>
                    <span slot="start" className="codicon codicon-add" />
                    Add Param
                </VSCodeButton>
            </div>
        );
    };

    return (
        <div>
            {showBlankCard && (
                <BlankConfigCard
                    onSave={(config) => {
                        onCreate(config);
                        setShowBlankCard(false);
                    }}
                    onCancel={() => setShowBlankCard(false)}
                    vdmjSchema={vdmjSchema}
                    settingsSchema={settingsSchema}
                />
            )}

            {showSnippetPicker && (
                <div style={{ marginBottom: "16px", padding: "16px", background: "var(--vscode-editor-background)", border: "1px solid var(--vscode-panel-border)", borderRadius: "4px" }}>
                    <div style={{ ...sharedStyles.groupTitle, marginBottom: "12px" }}>Select a template</div>
                    <VSCodeDivider />
                    <div
                        onClick={() => { setShowSnippetPicker(false); setShowBlankCard(true); }}
                        style={{ padding: "10px 0", cursor: "pointer" }}
                    >
                        <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--vscode-foreground)" }}>Blank Configuration</div>
                        <div style={{ fontSize: "12px", color: "var(--vscode-descriptionForeground)" }}>Choose exactly which fields to include.</div>
                        <VSCodeDivider role="presentation" />
                    </div>
                    {snippets.map((snippet, i) => (
                        <div
                            key={i}
                            onClick={() => {
                                const resolved = JSON.parse(
                                    JSON.stringify(snippet.body).replace(/\$\{\d+:[^}]*\}|\$\d+/g, "")
                                );
                                onCreate({ ...resolved, type: "vdm", request: "launch" });
                                setShowSnippetPicker(false);
                            }}
                            style={{ padding: "10px 0", cursor: "pointer" }}
                        >
                            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--vscode-foreground)" }}>{snippet.label}</div>
                            <div style={{ fontSize: "12px", color: "var(--vscode-descriptionForeground)" }}>{snippet.description}</div>
                            <VSCodeDivider role="presentation" />
                        </div>
                    ))}
                    <VSCodeButton appearance="secondary" onClick={() => setShowSnippetPicker(false)} style={{ marginTop: "8px" }}>
                        Cancel
                    </VSCodeButton>
                </div>
            )}

            {editingConfigs.length === 0 && !showSnippetPicker && !showBlankCard && (
                <div style={{ textAlign: "center", padding: "32px 0", color: "var(--vscode-descriptionForeground)", fontSize: "13px" }}>
                    No launch configurations yet. Add one below.
                </div>
            )}

            {editingConfigs.map((config, index) => (
                <div
                    key={index}
                    style={{ marginBottom: "12px", border: "1px solid var(--vscode-panel-border)", borderRadius: "4px", overflow: "hidden" }}
                >
                    <div
                        onClick={() => setExpandedIndex(expandedIndex === index ? null : index)}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "10px 16px",
                            cursor: "pointer",
                            background: expandedIndex === index ? "var(--vscode-list-activeSelectionBackground)" : "var(--vscode-editor-background)",
                        }}
                    >
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <span className={`codicon codicon-chevron-${expandedIndex === index ? "down" : "right"}`} />
                            <span style={{ fontSize: "13px", fontWeight: 600, color: expandedIndex === index ? "var(--vscode-list-activeSelectionForeground)" : "var(--vscode-foreground)" }}>
                                {config.name || "Unnamed Configuration"}
                            </span>
                        </div>
                        <VSCodeButton
                            appearance="icon"
                            title="Delete configuration"
                            onClick={(e: any) => { e.stopPropagation(); onDelete(index); }}
                        >
                            <span className="codicon codicon-trash" />
                        </VSCodeButton>
                    </div>

                    {expandedIndex === index && (
                        <div style={{ padding: "12px 16px", borderTop: "1px solid var(--vscode-panel-border)" }}>
                            {renderCommonFields(config, index)}
                            <CollapsibleSection marginTop="12px">
                                {renderSettingsFields(config, index)}
                                {renderPropertiesFields(config, index)}
                                {renderParamsFields(config, index)}
                            </CollapsibleSection>
                        </div>
                    )}
                </div>
            ))}

            {!showSnippetPicker && !showBlankCard && (
                <VSCodeButton
                    appearance="secondary"
                    onClick={() => setShowSnippetPicker(true)}
                    style={{ marginTop: "8px" }}
                >
                    <span slot="start" className="codicon codicon-add" />
                    Add Configuration
                </VSCodeButton>
            )}
        </div>
    );
};

const PluginsTab = ({
    schemas,
    data,
    onChange,
}: {
    schemas: PluginSchema[];
    data: Record<string, Record<string, unknown>>;
    onChange: (plugin: string, key: string, value: unknown) => void;
}) => {
    if (schemas.length === 0) {
        return (
            <div style={{ textAlign: "center", padding: "32px 0", color: "var(--vscode-descriptionForeground)", fontSize: "13px" }}>
                No plugins with settings are currently active.
            </div>
        );
    }

    const renderControl = (plugin: string, key: string, def: JsonSchemaProperty) => {
        const value = data[plugin]?.[key];

        if (def.enum) {
            return (
                <VSCodeDropdown
                    value={String(value ?? def.default ?? "")}
                    onChange={(e: any) => onChange(plugin, key, e.target.value)}
                    style={{ minWidth: "120px" }}
                >
                    {def.enum.map((opt) => (
                        <VSCodeOption key={opt} value={opt}>{opt}</VSCodeOption>
                    ))}
                </VSCodeDropdown>
            );
        }

        switch (def.type) {
            case "boolean":
                return (
                    <VSCodeCheckbox
                        checked={value === true}
                        onChange={(e: any) => onChange(plugin, key, e.target.checked)}
                    />
                );
            case "integer":
            case "number":
                return (
                    <VSCodeTextField
                        value={String(value ?? def.default ?? 0)}
                        onInput={(e: any) => {
                            const n = Number(e.target.value);
                            if (!isNaN(n)) {
                                onChange(plugin, key, n);
                            }
                        }}
                        style={{ minWidth: "80px" }}
                    />
                );
            case "string":
            default:
                return (
                    <VSCodeTextField
                        value={String(value ?? def.default ?? "")}
                        onInput={(e: any) => onChange(plugin, key, e.target.value)}
                        style={{ minWidth: "200px" }}
                    />
                );
        }
    };

    return (
        <div>
            {schemas.map(({ plugin, schema }, i) => (
                <CollapsibleSection key={plugin} label={plugin} marginTop={i === 0 ? "0px" : "16px"}>
                    {Object.entries(schema.properties).map(([key, def], j, arr) => (
                        <React.Fragment key={key}>
                            <FieldRow
                                label={def.title ?? key}
                                description={def.description}
                            >
                                {renderControl(plugin, key, def)}
                            </FieldRow>
                            {j < arr.length - 1 && <VSCodeDivider role="presentation" />}
                        </React.Fragment>
                    ))}
                </CollapsibleSection>
            ))}
        </div>
    );
};

// Main view

export const SettingsView = ({ vscodeApi }: SettingsViewProps) => {
    const [activeTab, setActiveTab] = useState<TabId>("general");
    const [settings, setSettings] = useState<Settings>({});
    const [schema, setSchema] = useState<Record<string, SchemaEntry>>({});
    const [wsFolderName, setWsFolderName] = useState<string | null>(null);
    const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set());
    const [filterText, setFilterText] = useState<string>("");
    const [showModifiedOnly, setShowModifiedOnly] = useState<boolean>(false);
    const [vdmjValues, setVdmjValues] = useState<Record<string, string>>({});
    const [vdmjSchema, setVdmjSchema] = useState<Record<string, VdmjSchemaEntry>>({});
    const [launchConfigs, setLaunchConfigs] = useState<LaunchConfig[]>([]);
    const [launchSnippets, setLaunchSnippets] = useState<LaunchSnippet[]>([]);
    const [launchSettingsSchema, setLaunchSettingsSchema] = useState<Record<string, { description: string }>>({});
    const [pluginSchemas, setPluginSchemas] = useState<PluginSchema[]>([]);
    const [pluginData, setPluginData] = useState<Record<string, Record<string, unknown>>>({});

    useEffect(() => {
        const onMessage = (e: MessageEvent) => {
            if (e.data.command === "loadSettings") {
                setSettings(e.data.data.settings);
                setSchema(e.data.data.schema);
                setWsFolderName(e.data.data.wsFolderName);
            }
            if (e.data.command === "loadVdmjProperties") {
                setVdmjValues(e.data.data.values);
                setVdmjSchema(e.data.data.schema);
            }
            if (e.data.command === "loadLaunchConfigurations") {
                setLaunchConfigs(e.data.data.configurations);
                setLaunchSnippets(e.data.data.snippets);
                setLaunchSettingsSchema(e.data.data.settingsSchema);
            }
            if (e.data.command === "loadPluginSchemas") {
                const schemas: PluginSchema[] = e.data.data.pluginSchemas;
                setPluginSchemas(schemas);
                const defaults: Record<string, Record<string, unknown>> = {};
                for (const { plugin, schema } of schemas ) {
                    defaults[plugin] = {};
                    for (const [key, def] of Object.entries(schema.properties)) {
                        defaults[plugin][key] = def.default ?? null;
                    }
                }
                setPluginData(defaults);
            }
        };
        window.addEventListener("message", onMessage);
        vscodeApi.postMessage({ command: "ready" });
        return () => window.removeEventListener("message", onMessage);
    }, []);

    const handleChange = (key: string, value: SettingValue) => {
        setSettings((prev) => ({ ...prev, [key]: value }));
        setPendingKeys((prev) => new Set(prev).add(key));
        setTimeout(() => {
            vscodeApi.postMessage({ command: "updateSetting", data: { key, value } });
            setPendingKeys((prev) => {
                const next = new Set(prev);
                next.delete(key);
                return next;
            });
        }, 300);
    };

    const handleVdmjChange = (key: string, value: string) => {
        setVdmjValues((prev) => ({ ...prev, [key]: value }));
        setTimeout(() => {
            vscodeApi.postMessage({ command: "saveVdmjProperty", data: { key, value } });
        }, 300);
    };

    const handleLaunchSave = (index: number, config: LaunchConfig) => {
        setLaunchConfigs((prev) => prev.map((c, i) => i === index ? config : c));
        setTimeout(() => {
            vscodeApi.postMessage({ command: "saveLaunchConfiguration", data: { index, config } });
        }, 300);
    };

    const handleLaunchCreate = (config: LaunchConfig) => {
        vscodeApi.postMessage({ command: "createLaunchConfiguration", data: { config } });
    };

    const handleLaunchDelete = (index: number) => {
        vscodeApi.postMessage({ command: "deleteLaunchConfiguration", data: { index } });
    };

    const handlePluginChange = (plugin: string, key: string, value: unknown) => {
        setPluginData((prev) => ({
            ...prev,
            [plugin]: { ...prev[plugin], [key]: value },
        }));
        // TODO: persist to plugin config file when server protocol supports it
    };

    const groups = Object.entries(schema).reduce<Record<string, [string, SchemaEntry][]>>(
        (acc, [key, entry]) => {
            if (!acc[entry.group]) acc[entry.group] = [];
            acc[entry.group].push([key, entry]);
            return acc;
        },
        {}
    );

    const modifiedKeys = useMemo(() => {
        return new Set(
            Object.entries(schema)
                .filter(([key, entry]) => {
                    const current = settings[key];
                    return current !== undefined && JSON.stringify(current) !== JSON.stringify(entry.default);
                })
                .map(([key]) => key)
        );
    }, [settings, schema]);

    const matchesFilter = (entry: SchemaEntry, key: string): boolean => {
        if (showModifiedOnly && !modifiedKeys.has(key)) return false;
        if (!filterText) return true;
        const q = filterText.toLowerCase();
        return entry.title.toLowerCase().includes(q) || entry.description.toLowerCase().includes(q);
    };

    const renderTabContent = () => {
        switch (activeTab) {
            case "general": {
                const commonGroups: Record<string, [string, SchemaEntry][]> = {};
                const advancedGroups: Record<string, [string, SchemaEntry][]> = {};

                for (const [group, entries] of Object.entries(groups)) {
                    const common = entries.filter(([key, e]) => !e.advanced && matchesFilter(e, key));
                    const advanced = entries.filter(([key, e]) => e.advanced && matchesFilter(e, key));
                    if (common.length > 0) commonGroups[group] = common;
                    if (advanced.length > 0) advancedGroups[group] = advanced;
                }

                const toDescriptor = ([key, entry]: [string, SchemaEntry]): SettingDescriptor => ({
                    key,
                    label: entry.title,
                    description: entry.description,
                    group: entry.group,
                    type: (entry.enum ? "enum" : entry.type) as SettingDescriptor["type"],
                    default: entry.default,
                    options: entry.enum?.map((v) => ({ value: v, label: v })) ?? [],
                    min: entry.minimum ?? undefined,
                    max: entry.maximum ?? undefined,
                } as SettingDescriptor);

                return (
                    <>
                        {Object.entries(commonGroups).map(([group, entries]) => (
                            <GroupSection
                                key={group}
                                group={group}
                                settings={entries.map(toDescriptor)}
                                values={settings}
                                onChange={handleChange}
                                vscodeApi={vscodeApi}
                                modifiedKeys={modifiedKeys}
                            />
                        ))}
                        <CollapsibleSection
                            forceOpen={(filterText.length > 0 || showModifiedOnly) && Object.keys(advancedGroups).length > 0}
                        >
                            {Object.entries(advancedGroups).map(([group, entries]) => (
                                <GroupSection
                                    key={group}
                                    group={group}
                                    settings={entries.map(toDescriptor)}
                                    values={settings}
                                    onChange={handleChange}
                                    vscodeApi={vscodeApi}
                                    modifiedKeys={modifiedKeys}
                                />
                            ))}
                        </CollapsibleSection>
                    </>
                );
            }
            case "vdmj":
                return <VdmjTab values={vdmjValues} schema={vdmjSchema} onChange={handleVdmjChange} />;
            case "launch":
                return (
                    <LaunchTab
                        configs={launchConfigs}
                        snippets={launchSnippets}
                        vscodeApi={vscodeApi}
                        vdmjSchema={vdmjSchema}
                        settingsSchema={launchSettingsSchema}
                        onSave={handleLaunchSave}
                        onCreate={handleLaunchCreate}
                        onDelete={handleLaunchDelete}
                    />
                );
            case "plugins":
                return (
                    <PluginsTab
                        schemas={pluginSchemas}
                        data={pluginData}
                        onChange={handlePluginChange}
                    />
                );
        }
    };

    return (
        <div style={{ padding: "24px 32px", maxWidth: "800px", margin: "0 auto", boxSizing: "border-box" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
                <div>
                    <div style={{ fontSize: "20px", fontWeight: 600, color: "var(--vscode-foreground)" }}>VDM Settings</div>
                    <div style={{ fontSize: "12px", color: "var(--vscode-descriptionForeground)", marginTop: "4px" }}>
                        Changes are saved to{" "}
                        <strong>{wsFolderName ? `folder: ${wsFolderName}` : "workspace"}</strong> scope.
                    </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    {pendingKeys.size > 0 && (
                        <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "3px", background: "var(--vscode-badge-background)", color: "var(--vscode-badge-foreground)", fontWeight: 600 }}>
                            Saving...
                        </span>
                    )}
                    <VSCodeButton
                        appearance="secondary"
                        onClick={() => vscodeApi.postMessage({ command: "openNativeSettings" })}
                    >
                        <span slot="start" className="codicon codicon-settings-gear" />
                        All settings
                    </VSCodeButton>
                </div>
            </div>

            <TabBar activeTab={activeTab} onSelect={setActiveTab} />

            {activeTab === "general" && (
                <div style={{ marginBottom: "20px", display: "flex", gap: "8px", alignItems: "center" }}>
                    <VSCodeTextField
                        placeholder="Search settings..."
                        value={filterText}
                        onInput={(e: any) => setFilterText(e.target.value)}
                        style={{ flex: 1 }}
                    >
                        <span slot="start" className="codicon codicon-search" />
                    </VSCodeTextField>
                    <VSCodeButton
                        appearance={showModifiedOnly ? "primary" : "secondary"}
                        onClick={() => setShowModifiedOnly((v) => !v)}
                        title="Show only modified settings"
                    >
                        <span slot="start" className="codicon codicon-diff-modified" />
                        Modified
                    </VSCodeButton>
                </div>
            )}

            {renderTabContent()}
        </div>
    );
};