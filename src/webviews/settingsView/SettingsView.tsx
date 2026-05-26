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
    const rowStyle: React.CSSProperties = {
        display: "flex",
        flexDirection: "row",
        alignItems: "flex-start",
        justifyContent: "space-between",
        padding: "10px 0",
        gap: "16px",
    };

    const labelColStyle: React.CSSProperties = {
        flex: "1 1 0",
        minWidth: 0,
    };

    const controlColStyle: React.CSSProperties = {
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
    };

    const labelStyle: React.CSSProperties = {
        fontSize: "13px",
        fontWeight: 600,
        color: "var(--vscode-foreground)",
        marginBottom: "2px",
        display: "flex",
        alignItems: "center",
        gap: "6px",
    };

    const descStyle: React.CSSProperties = {
        fontSize: "12px",
        color: "var(--vscode-descriptionForeground)",
    };

    const renderControl = () => {
        switch (descriptor.type) {
            case "boolean":
                return (
                    <VSCodeCheckbox
                        checked={value === true}
                        onChange={(e: any) => onChange(descriptor.key, e.target.checked)}
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
        <div style={rowStyle}>
            <div style={labelColStyle}>
                <div style={labelStyle}>
                    {descriptor.label}
                    {modified && (
                        <span
                            title="Modified from default"
                            style={{
                                width: "6px",
                                height: "6px",
                                borderRadius: "50%",
                                background: "var(--vscode-focusBorder)",
                                display: "inline-block",
                                flexShrink: 0,
                            }}
                        />
                    )}
                </div>
                <div style={descStyle}>{descriptor.description}</div>
            </div>
            <div style={controlColStyle}>{renderControl()}</div>
        </div>
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
}) => {
    const groupStyle: React.CSSProperties = {
        marginBottom: "24px",
    };

    const groupTitleStyle: React.CSSProperties = {
        fontSize: "11px",
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        color: "var(--vscode-descriptionForeground)",
        marginBottom: "8px",
    };

    return (
        <div style={groupStyle}>
            <div style={groupTitleStyle}>{group}</div>
            <VSCodeDivider />
            {settings.map((descriptor, i) => (
                <React.Fragment key={descriptor.key}>
                    <SettingRow descriptor={descriptor} value={values[descriptor.key]} onChange={onChange} vscodeApi={vscodeApi} modified={modifiedKeys.has(descriptor.key)} />
                    {i < settings.length - 1 && <VSCodeDivider role="presentation" />}
                </React.Fragment>
            ))}
        </div>
    );
};

const AdvancedSection = ({
    groups,
    settings,
    onChange,
    vscodeApi,
    forceOpen,
    modifiedKeys,
}: {
    groups: Record<string, [string, SchemaEntry][]>;
    settings: Settings;
    onChange: (key: string, value: SettingValue) => void;
    vscodeApi: VSCodeAPI;
    forceOpen?: boolean;
    modifiedKeys: Set<string>;
}) => {
    const [open, setOpen] = useState(false);
    const isOpen = forceOpen || open;

    return (
        <div style={{ marginTop: "16px" }}>
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
                Advanced
            </button>
            {isOpen && (
                <div style={{ marginTop: "12px" }}>
                    {Object.entries(groups).map(([group, entries]) => (
                        <GroupSection
                            key={group}
                            group={group}
                            settings={entries.map(([key, entry]) => ({
                                key,
                                label: entry.title,
                                description: entry.description,
                                group: entry.group,
                                type: (entry.enum ? "enum" : entry.type) as SettingDescriptor["type"],
                                default: entry.default,
                                options: entry.enum?.map((v) => ({ value: v, label: v })) ?? [],
                                min: entry.minimum ?? undefined,
                                max: entry.maximum ?? undefined,
                            }) as SettingDescriptor)}
                            values={settings}
                            onChange={onChange}
                            vscodeApi={vscodeApi}
                            modifiedKeys={modifiedKeys}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

const VdmjPropertyRow = ({
    propKey,
    schema,
    value,
    isModified,
    onChange,
}: {
    propKey: string,
    schema: VdmjSchemaEntry,
    value: string,
    isModified: boolean,
    onChange: (key: string, value: string) => void;
}) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "10px 0", gap: "16px" }}>
        <div style={{ flex: "1 1 0", minWidth: 0 }}>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--vscode-foreground)", marginBottom: "2px", display: "flex", alignItems: "center", gap: "6px" }}>
                {schema.title}
                {isModified && (
                    <span
                        title="Modified from default"
                        style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--vscode-focusBorder)", display: "inline-block", flexShrink: 0 }}
                    />
                )}
            </div>
            <div style={{ fontSize: "11px", color: "var(--vscode-descriptionForeground)", fontFamily: "var(--vscode-editor-font-family)", marginBottom: "2px" }}>
                {propKey}
            </div>
            <div style={{ fontSize: "12px", color: "var(--vscode-descriptionForeground)" }}>{schema.description}</div>
        </div>
        <div style={{ flexShrink: 0, display: "flex", alignItems: "center" }}>
            {schema.type === "boolean" ? (
                <VSCodeCheckbox
                    checked={value === "true"}
                    onChange={(e: any) => onChange(propKey, e.target.checked ? "true" : "false")}
                />
            ) : (
                <VSCodeTextField
                    value={value}
                    onInput={(e: any) => onChange(propKey, e.target.value)}
                    style={{ minWidth: schema.type === "number" ? "80px" : "200px" }}
                />
            )}
        </div>
    </div>
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
    const [advancedOpen, setAdvancedOpen] = useState(false);

    const isModified = (key: string) => values[key] !== undefined && values[key] !== schema[key]?.default;

    const matchesFilter = (key: string, entry: VdmjSchemaEntry) => {
        if (showModifiedOnly && !isModified(key)) {
            return false;
        }
        if (!filterText) {
            return true;
        }
        const q = filterText.toLowerCase();
        return key.toLowerCase().includes(q) || entry.description.toLowerCase().includes(q);
    };

    const groupByCategory = (entries: [string, VdmjSchemaEntry][]) =>
        entries.reduce<Record<string, [string, VdmjSchemaEntry][]>>((acc, [key, entry]) => {
            if (!acc[entry.category]) {
                acc[entry.category] = [];
            }
            acc[entry.category].push([key, entry]);
            return acc;
        }, {});

    const allEntries = Object.entries(schema);
    const commonGroups = groupByCategory(allEntries.filter(([k, e]) => !e.advanced && matchesFilter(k, e)));
    const advancedGroups = groupByCategory(allEntries.filter(([k, e]) => e.advanced && matchesFilter(k, e)));
    const forceAdvancedOpen = (filterText.length > 0 || showModifiedOnly) && Object.keys(advancedGroups).length > 0;

    const renderGroup = (category: string, entries: [string, VdmjSchemaEntry][]) => (
        <div key={category} style={{ marginBottom: "24px" }}>
            <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--vscode-descriptionForeground)", marginBottom: "8px" }}>
                {category}
            </div>
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

            <div style={{ marginTop: "16px" }}>
                <button
                    onClick={() => setAdvancedOpen((o) => !o)}
                    style={{ display: "flex", alignItems: "center", gap: "6px", background: "none", border: "none", cursor: "pointer", color: "var(--vscode-descriptionForeground)", fontSize: "12px", fontWeight: 600, padding: "4px 0" }}
                >
                    <span className={`codicon codicon-chevron-${forceAdvancedOpen || advancedOpen ? "down" : "right"}`} />
                    Advanced
                </button>
                {(forceAdvancedOpen || advancedOpen) && (
                    <div style={{ marginTop: "12px" }}>
                        {Object.entries(advancedGroups).map(([category, entries]) => renderGroup(category, entries))}
                    </div>
                )}
            </div>
        </div>
    );
};

const AdvancedFieldsSection = ({ children }: { children: React.ReactNode }) => {
    const [open, setOpen] = useState(false);
    return (
        <div style={{ marginTop: "12px" }}>
            <button
                onClick={() => setOpen((o) => !o)}
                style={{ display: "flex", alignItems: "center", gap: "6px", background: "none", border: "none", cursor: "pointer", color: "var(--vscode-descriptionForeground)", fontSize: "12px", fontWeight: 600, padding: "4px 0" }}
            >
                <span className={`codicon codicon-chevron-${open ? "down" : "right"}`} />
                Advanced
            </button>
            {open && <div style={{ marginTop: "8px" }}>{children}</div>}
        </div>
    );
};

const LaunchTab = ({
    configs,
    snippets,
    vscodeApi,
    onSave,
    onCreate,
    onDelete,
}: {
    configs: LaunchConfig[];
    snippets: LaunchSnippet[];
    vscodeApi: VSCodeAPI;
    onSave: (index: number, config: LaunchConfig) => void;
    onCreate: (config: LaunchConfig) => void;
    onDelete: (index: number) => void;
}) => {
    const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
    const [showSnippetPicker, setShowSnippetPicker] = useState(false);
    const [editingConfigs, setEditingConfigs] = useState<LaunchConfig[]>(configs);

    useEffect(() => {
        setEditingConfigs(configs);
    }, [configs]);

    const handleFieldChange = (index: number, field: keyof LaunchConfig, value: any) => {
        const updated = editingConfigs.map((c, i) => 
            i === index ? { ...c, [field]: value } : c
        );
        setEditingConfigs(updated);
        setTimeout(() => onSave(index, updated[index]), 300);
    };

    const commonFieldStyle: React.CSSProperties = {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "8px 0",
        gap: "16px",
    };

    const fieldLabelStyle: React.CSSProperties = {
        fontSize: "12px",
        color: "var(--vscode-foreground)",
        fontWeight: 600,
        flex: "1 1 0",
    };

    const renderCommonFields = (config: LaunchConfig, index: number) => (
        <>
            <div style={commonFieldStyle}>
                <span style={fieldLabelStyle}>Name</span>
                <VSCodeTextField
                    value={config.name}
                    onInput={(e: any) => handleFieldChange(index, "name", e.target.value)}
                    style={{ minWidth: "200px" }}
                />
            </div>
            <VSCodeDivider role="presentation" />
            <div style={commonFieldStyle}>
                <span style={fieldLabelStyle}>No Debug</span>
                <VSCodeCheckbox
                    checked={config.noDebug === true}
                    onChange={(e: any) => handleFieldChange(index, "noDebug", e.target.value)}
                />
            </div>
            <VSCodeDivider role="presentation" />
            <div style={commonFieldStyle}>
                <span style={fieldLabelStyle}>Default Name</span>
                <VSCodeTextField
                    value={config.defaultName ?? ""}
                    onInput={(e: any) => handleFieldChange(index, "defaultName", e.target.value)}
                    style={{ minWidth: "200px" }}
                    placeholder="e.g. DEFAULT"
                />
            </div>
            <VSCodeDivider role="presentation" />
            <div style={commonFieldStyle}>
                <span style={fieldLabelStyle}>Command</span>
                <VSCodeTextField
                    value={config.command ?? ""}
                    onInput={(e: any) => handleFieldChange(index, "command", e.target.value)}
                    style={{ minWidth: "200px" }}
                    placeholder="e.g. print f()"
                />
            </div>
            <VSCodeDivider role="presentation" />
            <div style={commonFieldStyle}>
                <span style={fieldLabelStyle}>Remote Control</span>
                <VSCodeTextField
                    value={config.remoteControl ?? ""}
                    onInput={(e: any) => handleFieldChange(index, "remoteControl", e.target.value)}
                    style={{ minWidth: "200px" }}
                    placeholder="e.g. com.example.Controller"
                />
            </div>
            <VSCodeDivider role="presentation" />
            <div style={commonFieldStyle}>
                <span style={fieldLabelStyle}>Enable Logging</span>
                <VSCodeCheckbox
                    checked={config.enableLogging === true}
                    onChange={(e: any) => handleFieldChange(index, "enableLogging", e.target.value)}
                />
            </div>
        </>
    );

    const renderAdvancedFields = (config: LaunchConfig, index: number) => (
        <>
            <div style={commonFieldStyle}>
                <span style={fieldLabelStyle}>Settings</span>
                <VSCodeButton
                    appearance="icon"
                    title="Edit in launch.json"
                    onClick={() => vscodeApi.postMessage({ command: "openNativeSettings", data: { query: "@ext:overturetool.vdm-vscode" } })}
                >
                    <span className="codicon codicon-link-external" />
                </VSCodeButton>
            </div>
            <VSCodeDivider role="presentation" />
            <div style={commonFieldStyle}>
                <span style={fieldLabelStyle}>Properties</span>
                <VSCodeButton
                    appearance="icon"
                    title="Edit in launch.json"
                    onClick={() => vscodeApi.postMessage({ command: "openNativeSettings", data: { query: "@ext:overturetool.vdm-vscode" } })}
                >
                    <span className="codicon codicon-link-external" />
                </VSCodeButton>
            </div>
        </>
    );

    return (
        <div>
            {showSnippetPicker && (
                <div style={{ marginBottom: "16px", padding: "16px", background: "var(--vscode-editor-background)", border: "1px solid var(--vscode-panel-border)", borderRadius: "4px" }}>
                    <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--vscode-descriptionForeground)", marginBottom: "12px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        Select a template
                    </div>
                    <VSCodeDivider />
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

            {editingConfigs.length === 0 && !showSnippetPicker && (
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
                            onClick={(e: any) => {
                                e.stopPropagation();
                                onDelete(index);
                            }}
                        >
                            <span className="codicon codicon-trash" />
                        </VSCodeButton>
                    </div>

                    {expandedIndex === index && (
                        <div style={{ padding: "12px 16px", borderTop: "1px solid var(--vscode-panel-border)" }}>
                            {renderCommonFields(config, index)}
                            <AdvancedFieldsSection>
                                {renderAdvancedFields(config, index)}
                            </AdvancedFieldsSection>
                        </div>
                    )}
                </div>
            ))}

            {!showSnippetPicker && (
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
    }

    const handleLaunchDelete = (index: number) => {
        vscodeApi.postMessage({  command: "deleteLaunchConfiguration", data: { index } });
    };

    // Group schema entries by their group title
    const groups = Object.entries(schema).reduce<Record<string, [string, SchemaEntry][]>>(
        (acc, [key, entry]) => {
            if (!acc[entry.group]) acc[entry.group] = [];
            acc[entry.group].push([key, entry]);
            return acc;
        },
        {}
    );

    const containerStyle: React.CSSProperties = {
        padding: "24px 32px",
        maxWidth: "800px",
        margin: "0 auto",
        boxSizing: "border-box",
    };

    const headerStyle: React.CSSProperties = {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: "24px",
    };

    const titleStyle: React.CSSProperties = {
        fontSize: "20px",
        fontWeight: 600,
        color: "var(--vscode-foreground)",
    };

    const subtitleStyle: React.CSSProperties = {
        fontSize: "12px",
        color: "var(--vscode-descriptionForeground)",
        marginTop: "4px",
    };

    const scopeBadgeStyle: React.CSSProperties = {
        fontSize: "11px",
        padding: "2px 8px",
        borderRadius: "3px",
        background: "var(--vscode-badge-background)",
        color: "var(--vscode-badge-foreground)",
        fontWeight: 600,
    };

    const matchesFilter = (entry: SchemaEntry, key: string): boolean => {
        if (showModifiedOnly && !modifiedKeys.has(key)) return false;
        if (!filterText) return true;
        const q = filterText.toLowerCase();
        return entry.title.toLowerCase().includes(q) || entry.description.toLowerCase().includes(q);
    }

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

    const renderTabContent = () => {
        switch (activeTab) {
            case "general": {
                const commonGroups: Record<string, [string, SchemaEntry][]> = {};
                const advancedGroups: Record<string, [string, SchemaEntry][]> = {};

                for (const [group, entries] of Object.entries(groups)) {
                    const common = entries.filter(([key, e]) => !e.advanced && matchesFilter(e, key));
                    const advanced = entries.filter(([key, e]) => e.advanced && matchesFilter(e, key));
                    if (common.length > 0) {
                        commonGroups[group] = common;
                    }
                    if (advanced.length > 0) {
                        advancedGroups[group] = advanced;
                    }
                }

                return (
                    <>
                        {Object.entries(commonGroups).map(([group, entries]) => (
                            <GroupSection
                                key={group}
                                group={group}
                                settings={entries.map(([key, entry]) => ({
                                    key,
                                    label: entry.title,
                                    description: entry.description,
                                    group: entry.group,
                                    type: (entry.enum ? "enum" : entry.type) as SettingDescriptor["type"],
                                    default: entry.default,
                                    options: entry.enum?.map((v) => ({ value: v, label: v })) ?? [],
                                    min: entry.minimum ?? undefined,
                                    max: entry.maximum ?? undefined,
                                }) as SettingDescriptor)}
                                values={settings}
                                onChange={handleChange}
                                vscodeApi={vscodeApi}
                                modifiedKeys={modifiedKeys}
                            />
                        ))}
                        <AdvancedSection
                            groups={advancedGroups}
                            settings={settings}
                            onChange={handleChange}
                            vscodeApi={vscodeApi}
                            forceOpen={(filterText.length > 0 || showModifiedOnly) && Object.keys(advancedGroups).length > 0}
                            modifiedKeys={modifiedKeys}
                        />
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
                        onSave={handleLaunchSave}
                        onCreate={handleLaunchCreate}
                        onDelete={handleLaunchDelete}
                    />
                );
            case "plugins":
                return <ComingSoonTab label="Plugins"/>;
        }
    };

    return (
        <div style={containerStyle}>
            <div style={headerStyle}>
                <div>
                    <div style={titleStyle}>VDM Settings</div>
                    <div style={subtitleStyle}>
                        Changes are saved to{" "}
                        <strong>{wsFolderName ? `folder: ${wsFolderName}` : "workspace"}</strong> scope.
                    </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    {pendingKeys.size > 0 && <span style={scopeBadgeStyle}>Saving...</span>}
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