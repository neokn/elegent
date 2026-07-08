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

      {step === "codex" && (
        <Box flexDirection="column">
          <Text>Codex config scope</Text>
          <Select
            options={SCOPE_OPTIONS}
            defaultValue={answers.codexScope}
            onChange={(value) => {
              setAnswers({ ...answers, codexScope: value as AgentConfigScope });
              setStep("agy");
            }}
          />
        </Box>
      )}

      {step === "agy" && (
        <Box flexDirection="column">
          <Text>Antigravity (agy) config scope</Text>
          <Select
            options={SCOPE_OPTIONS}
            defaultValue={answers.agyScope}
            onChange={(value) => finish({ ...answers, agyScope: value as AgentConfigScope })}
          />
        </Box>
      )}

      {step === "done" && <StatusMessage variant="success">Ready</StatusMessage>}
    </Box>
  );
}

export async function promptInitAnswers(defaults: InitAnswers): Promise<InitAnswers> {
  const instance = render(<InitWizard defaults={defaults} />);
  const result = await instance.waitUntilExit();
  return (result ?? defaults) as InitAnswers;
}
