import React, { useState } from "react";
import { Box, Text, render, useApp } from "ink";
import { Select, TextInput, StatusMessage } from "@inkjs/ui";
import type { AgentConfigScope } from "@core/application/bootstrap";

export interface InitAnswers {
  vaultName: string;
  claudeScope: AgentConfigScope;
  codexScope: AgentConfigScope;
  agyScope: AgentConfigScope;
}

type Step = "vault" | "claude" | "codex" | "agy" | "done";

const SCOPE_OPTIONS = [
  { label: "Project scope", value: "project" },
  { label: "User scope", value: "user" },
  { label: "Local scope（嵌入本專案、私有）", value: "local" },
  { label: "Do not install", value: "none" },
];

/**
 * 依已選的前面步驟過濾可選 scope，讓不相容組合在選擇當下就消失，而不是等三步都選完、
 * bootstrap() 的 assertScopeCompatible 才丟例外逼使用者從頭重來。規則同 bootstrap.ts：
 * 選過 local → 後面只能 local/none；選過 project/user → 後面不能再選 local。
 */
export function availableScopeOptions(chosenSoFar: AgentConfigScope[]) {
  const hasLocal = chosenSoFar.includes("local");
  const hasProjectOrUser = chosenSoFar.some((s) => s === "project" || s === "user");
  if (hasLocal) return SCOPE_OPTIONS.filter((o) => o.value === "local" || o.value === "none");
  if (hasProjectOrUser) return SCOPE_OPTIONS.filter((o) => o.value !== "local");
  return SCOPE_OPTIONS;
}

export function scopeStepDefault(options: typeof SCOPE_OPTIONS, preferred: AgentConfigScope): AgentConfigScope {
  return options.some((o) => o.value === preferred) ? preferred : (options[0]!.value as AgentConfigScope);
}

function InitWizard({ defaults }: { defaults: InitAnswers }) {
  const app = useApp();
  const [step, setStep] = useState<Step>("vault");
  const [answers, setAnswers] = useState<InitAnswers>(defaults);

  const finish = (next: InitAnswers): void => {
    setAnswers(next);
    setStep("done");
    app.exit(next);
  };

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>EleGent init</Text>

      {step === "vault" && (
        <Box flexDirection="column">
          <Text>Vault directory name</Text>
          <TextInput
            defaultValue={answers.vaultName}
            placeholder="vault"
            onSubmit={(value) => {
              setAnswers({ ...answers, vaultName: value.trim() || "vault" });
              setStep("claude");
            }}
          />
        </Box>
      )}

      {step === "claude" && (
        <Box flexDirection="column">
          <Text>Claude config scope</Text>
          <Select
            options={SCOPE_OPTIONS}
            defaultValue={answers.claudeScope}
            onChange={(value) => {
              setAnswers({ ...answers, claudeScope: value as AgentConfigScope });
              setStep("codex");
            }}
          />
        </Box>
      )}

      {step === "codex" && (() => {
        const options = availableScopeOptions([answers.claudeScope]);
        return (
          <Box flexDirection="column">
            <Text>Codex config scope</Text>
            {options.length < SCOPE_OPTIONS.length && (
              <Text dimColor>（已依 Claude 選擇的 scope 排除不相容選項：local 不能與 project/user 混用）</Text>
            )}
            <Select
              options={options}
              defaultValue={scopeStepDefault(options, answers.codexScope)}
              onChange={(value) => {
                setAnswers({ ...answers, codexScope: value as AgentConfigScope });
                setStep("agy");
              }}
            />
          </Box>
        );
      })()}

      {step === "agy" && (() => {
        const options = availableScopeOptions([answers.claudeScope, answers.codexScope]);
        return (
          <Box flexDirection="column">
            <Text>Antigravity (agy) config scope</Text>
            {options.length < SCOPE_OPTIONS.length && (
              <Text dimColor>（已依前面選擇的 scope 排除不相容選項：local 不能與 project/user 混用）</Text>
            )}
            <Select
              options={options}
              defaultValue={scopeStepDefault(options, answers.agyScope)}
              onChange={(value) => finish({ ...answers, agyScope: value as AgentConfigScope })}
            />
          </Box>
        );
      })()}

      {step === "done" && <StatusMessage variant="success">Ready</StatusMessage>}
    </Box>
  );
}

export async function promptInitAnswers(defaults: InitAnswers): Promise<InitAnswers> {
  const instance = render(<InitWizard defaults={defaults} />);
  const result = await instance.waitUntilExit();
  return (result ?? defaults) as InitAnswers;
}
