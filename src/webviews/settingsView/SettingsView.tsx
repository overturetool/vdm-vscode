// SPDX-License-Identifier: GPL-3.0-or-later

import React, { useEffect, useState } from "react";
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
}: {
    descriptor: SettingDescriptor;
    value: SettingValue;
    onChange: (key: string, value: SettingValue) => void;
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
        }
    };

    return (
        <div style={rowStyle}>
            <div style={labelColStyle}>
                <div style={labelStyle}>{descriptor.label}</div>
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
}: {
    group: string;
    settings: SettingDescriptor[];
    values: Settings;
    onChange: (key: string, value: SettingValue) => void;
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
                    <SettingRow descriptor={descriptor} value={values[descriptor.key]} onChange={onChange} />
                    {i < settings.length - 1 && <VSCodeDivider role="presentation" />}
                </React.Fragment>
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

    useEffect(() => {
        const onMessage = (e: MessageEvent) => {
            if (e.data.command === "loadSettings") {
                setSettings(e.data.data.settings);
                setSchema(e.data.data.schema);
                setWsFolderName(e.data.data.wsFolderName);
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

    const renderTabContent = () => {
        switch (activeTab) {
            case "general":
                return Object.entries(groups).map(([group, entries]) => (
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
                    />
                ));
            case "vdmj":
                return <ComingSoonTab label="VDMJ"/>;
            case "launch":
                return <ComingSoonTab label="Launch"/>;
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

            {renderTabContent()}
        </div>
    );
};