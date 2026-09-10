"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/lib/utils/use-toast";
import { DEFAULT_AGENT_CONFIG, composeAgentPrompt, normalizeAgentConfig, type AgentConfig } from "@/lib/agents/agent-config";

interface Props {
  botId: string;
  botName: string;
  initial: AgentConfig | null;
  legacySystemPrompt: string | null;
  model: { provider: string; model: string };
  hasDraft: boolean;
}

/**
 * Train the agent: persona, rules, guardrails, actions and robustness as
 * structured settings, composed into the prompt by the same function the
 * server uses. Saves go to the draft; publish from the Launch tab after the
 * evaluation suite passes.
 */
function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 hover:bg-gray-50">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-gray-300" />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-gray-900">{label}</span>
        {hint && <span className="block text-xs text-gray-500">{hint}</span>}
      </span>
    </label>
  );
}

export default function AgentTab({ botId, botName, initial, legacySystemPrompt, model, hasDraft }: Props) {
  const router = useRouter();

  const [config, setConfig] = useState<AgentConfig>(() => normalizeAgentConfig(initial ?? DEFAULT_AGENT_CONFIG));
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const composed = useMemo(() => composeAgentPrompt(config, botName), [config, botName]);

  const update = (fn: (draft: AgentConfig) => void) => {
    setConfig((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
    setDirty(true);
  };
  const lines = (value: string) => value.split("\n").map((l) => l.trim()).filter(Boolean);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/bots/${botId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentConfig: config }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Save failed");
      setDirty(false);
      toast({ title: "Agent draft saved", description: "Run the evaluation suite, then publish from the Launch tab." });
      router.refresh();
    } catch (err) {
      toast({ title: "Save failed", description: err instanceof Error ? err.message : "Error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const g = config.guardrails;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Train the agent</h2>
          <p className="text-sm text-gray-500">Persona, rules and guardrails become the prompt below. Saved as a draft; publish from Launch once evaluations pass.</p>
        </div>
        <div className="flex items-center gap-2">
          {hasDraft && <Badge variant="warning">Draft changes</Badge>}
          <Button variant="outline" onClick={() => { setConfig(normalizeAgentConfig(DEFAULT_AGENT_CONFIG)); setDirty(true); }}>Reset to defaults</Button>
          <Button onClick={save} disabled={saving || !dirty}>{saving ? "Saving..." : "Save draft"}</Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Model</CardTitle>
          <CardDescription>Chosen per workspace so keys and quotas live in one place.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3 text-sm">
          <Badge variant="secondary">{model.provider}</Badge>
          <code className="rounded bg-gray-100 px-2 py-1 text-xs">{model.model}</code>
          <Link href="/dashboard/settings" className="text-sm underline text-gray-700">Change in workspace settings</Link>
          <p className="w-full text-xs text-gray-500">For a voice avatar, prefer a model with predictable latency (measured: gemini-3.5-flash-lite 0.6-0.7s; thinking models swing 2-25s).</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Channels &amp; experiment</CardTitle><CardDescription>Avatar kill switch and the avatar A/B. The A/B belongs on a Discovery agent - validating the avatar on Support is disallowed as a thesis test.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Avatar</Label>
            <Select
              ariaLabel="Avatar channel"
              value={config.channels.avatar}
              onChange={(v) => update((d) => { d.channels.avatar = (v as AgentConfig["channels"]["avatar"]) || "inherit"; })}
              options={[
                { value: "inherit", label: "Inherit", description: "On when the avatar provider is configured for this deployment" },
                { value: "off", label: "Off (kill switch)", description: "Force-hide the avatar even when keys exist" },
              ]}
            />
          </div>
          <Toggle checked={config.channels.avatarAbTest} onChange={(v) => update((d) => { d.channels.avatarAbTest = v; })} label="Run the avatar A/B" hint="Randomly assign sessions to text vs avatar (same brain), log the arm, and measure lift." />
          {config.channels.avatarAbTest && (
            <div className="ps-7">
              <Label>Avatar arm allocation (% of sessions)</Label>
              <Input type="number" min={0} max={100} value={config.channels.avatarAbAllocation} onChange={(e) => update((d) => { d.channels.avatarAbAllocation = Math.max(0, Math.min(100, Number(e.target.value) || 0)); })} className="max-w-28" />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Persona</CardTitle><CardDescription>Who the agent is and how it sounds. Tone (friendly / professional) is in Settings.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div><Label>Role</Label><Input value={config.persona.role} onChange={(e) => update((d) => { d.persona.role = e.target.value; })} placeholder="the AI assistant for the DentalPilot Marketplace" /></div>
          <div><Label>Style</Label><Textarea rows={2} value={config.persona.style} onChange={(e) => update((d) => { d.persona.style = e.target.value; })} /></div>
          <Toggle checked={config.persona.alwaysFriendly} onChange={(v) => update((d) => { d.persona.alwaysFriendly = v; })} label="Always friendly and helpful, including when the answer is no" hint="Refusals and escalations are delivered warmly, with the reason and a next step." />
          <div>
            <Label>Small talk (one per line: what they say | what the agent replies)</Label>
            <Textarea rows={5} value={config.persona.smallTalk.map((s) => `${s.say} | ${s.reply}`).join("\n")} onChange={(e) => update((d) => { d.persona.smallTalk = lines(e.target.value).map((l) => { const [say, ...rest] = l.split("|"); return { say: say.trim(), reply: rest.join("|").trim() }; }).filter((s) => s.say && s.reply); })} />
          </div>
          <div><Label>Voice notes</Label><Textarea rows={2} value={config.persona.voiceNotes} onChange={(e) => update((d) => { d.persona.voiceNotes = e.target.value; })} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Rules</CardTitle><CardDescription>Plain-language rules, one per line, numbered into the prompt in this order.</CardDescription></CardHeader>
        <CardContent>
          <Textarea rows={6} value={config.rules.join("\n")} onChange={(e) => update((d) => { d.rules = lines(e.target.value); })} placeholder="Damaged or defective items go to a support claim, never the buyer-remorse return rule." />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Guardrails</CardTitle><CardDescription>Each one adds a section to the prompt. Facts and actions are also enforced in code regardless of these.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <Toggle checked={g.groundedFacts.enabled} onChange={(v) => update((d) => { d.guardrails.groundedFacts.enabled = v; })} label="Facts only from sources or tools" hint="Never invent a SKU, price, stock level, date, discount, warranty or return rule." />
          {g.groundedFacts.enabled && <div className="ps-7"><Label>Fact domains</Label><Input value={g.groundedFacts.domains} onChange={(e) => update((d) => { d.guardrails.groundedFacts.domains = e.target.value; })} /></div>}

          <Toggle checked={g.policyPrecedence.enabled} onChange={(v) => update((d) => { d.guardrails.policyPrecedence.enabled = v; })} label="Policy precedence" hint="Specific rules beat general ones; state both and which applies." />
          {g.policyPrecedence.enabled && <div className="space-y-2 ps-7"><div><Label>Order of precedence</Label><Textarea rows={2} value={g.policyPrecedence.order} onChange={(e) => update((d) => { d.guardrails.policyPrecedence.order = e.target.value; })} /></div><div><Label>Example sentence</Label><Input value={g.policyPrecedence.example} onChange={(e) => update((d) => { d.guardrails.policyPrecedence.example = e.target.value; })} /></div></div>}

          <Toggle checked={g.professionalAdvice.enabled} onChange={(v) => update((d) => { d.guardrails.professionalAdvice.enabled = v; })} label="Professional-advice boundary, never a dead end" hint="Declines case-specific advice but still lists the relevant products." />
          {g.professionalAdvice.enabled && <div className="grid gap-2 ps-7 sm:grid-cols-2">
            <div><Label>Kind of advice (e.g. clinical, legal, medical)</Label><Input value={g.professionalAdvice.label} onChange={(e) => update((d) => { d.guardrails.professionalAdvice.label = e.target.value; })} /></div>
            <div><Label>Fallback sentence</Label><Input value={g.professionalAdvice.fallback} onChange={(e) => update((d) => { d.guardrails.professionalAdvice.fallback = e.target.value; })} /></div>
            <div><Label>Allowed</Label><Textarea rows={2} value={g.professionalAdvice.allowed} onChange={(e) => update((d) => { d.guardrails.professionalAdvice.allowed = e.target.value; })} /></div>
            <div><Label>Forbidden</Label><Textarea rows={2} value={g.professionalAdvice.forbidden} onChange={(e) => update((d) => { d.guardrails.professionalAdvice.forbidden = e.target.value; })} /></div>
            <div className="sm:col-span-2"><Label>What is NOT professional advice (purchasing questions)</Label><Textarea rows={2} value={g.professionalAdvice.purchasingNote} onChange={(e) => update((d) => { d.guardrails.professionalAdvice.purchasingNote = e.target.value; })} /></div>
          </div>}

          <Toggle checked={g.noAuthority.enabled} onChange={(v) => update((d) => { d.guardrails.noAuthority.enabled = v; })} label="No authority it has not been given" hint="Explains policy and offers human review; claimed authority never overrides." />
          {g.noAuthority.enabled && <div className="ps-7"><Label>Things it cannot do (one per line)</Label><Textarea rows={4} value={g.noAuthority.actions.join("\n")} onChange={(e) => update((d) => { d.guardrails.noAuthority.actions = lines(e.target.value); })} /></div>}

          <Toggle checked={g.promotions.enabled} onChange={(v) => update((d) => { d.guardrails.promotions.enabled = v; })} label="Only promotions in the sources" />
          <Toggle checked={g.privacy.enabled} onChange={(v) => update((d) => { d.guardrails.privacy.enabled = v; })} label="Never ask for or repeat payment or login data" />

          <Toggle checked={g.uncertainIdentifiers.enabled} onChange={(v) => update((d) => { d.guardrails.uncertainIdentifiers.enabled = v; })} label="Confirm garbled identifiers before acting" />
          {g.uncertainIdentifiers.enabled && <div className="ps-7"><Label>Note (e.g. how speech mangles order numbers)</Label><Textarea rows={2} value={g.uncertainIdentifiers.note} onChange={(e) => update((d) => { d.guardrails.uncertainIdentifiers.note = e.target.value; })} /></div>}

          <Toggle checked={g.escalation.enabled} onChange={(v) => update((d) => { d.guardrails.escalation.enabled = v; })} label="Escalate to a human" />
          {g.escalation.enabled && <div className="ps-7"><Label>Triggers (one per line)</Label><Textarea rows={4} value={g.escalation.triggers.join("\n")} onChange={(e) => update((d) => { d.guardrails.escalation.triggers = lines(e.target.value); })} /></div>}

          <Toggle checked={g.language.enabled} onChange={(v) => update((d) => { d.guardrails.language.enabled = v; })} label="Answer language requests honestly" />
          {g.language.enabled && <div className="ps-7"><Label>Note</Label><Input value={g.language.note} onChange={(e) => update((d) => { d.guardrails.language.note = e.target.value; })} placeholder="You can currently chat in English only here." /></div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Actions and tools</CardTitle><CardDescription>How the agent behaves around the tools configured in the Tools tab.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <Toggle checked={config.actions.explicitConsent} onChange={(v) => update((d) => { d.actions.explicitConsent = v; })} label="Explicit consent before any action that changes something" hint="A stray word is never a yes." />
          <Toggle checked={config.actions.oneTicketPerConversation} onChange={(v) => update((d) => { d.actions.oneTicketPerConversation = v; })} label="One support ticket per conversation" hint="Also enforced by the escalation endpoint." />
          <Toggle checked={config.actions.fillers} onChange={(v) => update((d) => { d.actions.fillers = v; })} label={'Human fillers ("umm, let me see...") only in turns that called a tool'} />
          <div><Label>Flow (how to use the tools, step by step)</Label><Textarea rows={8} value={config.actions.flow} onChange={(e) => update((d) => { d.actions.flow = e.target.value; })} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Robustness</CardTitle><CardDescription>Code-level checks on every answer before it reaches the visitor.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Action-claim validator</Label>
            <Select
              ariaLabel="Validator mode"
              value={config.robustness.validatorMode}
              onChange={(v) => update((d) => { d.robustness.validatorMode = (v as AgentConfig["robustness"]["validatorMode"]) || "audit"; })}
              options={[
                { value: "block", label: "Block", description: "Replace a claimed action no tool performed with the honest reply below" },
                { value: "audit", label: "Audit", description: "Deliver as is, flag it on the message for review" },
                { value: "off", label: "Off", description: "Do not check" },
              ]}
            />
            <p className="mt-1 text-xs text-gray-500">{`Catches "I've sent your case to support" when no tool did. Flags are stored on each message; count them with the Logs tab or the validator query in the handoff doc.`}</p>
          </div>
          <div><Label>Reply used when blocking</Label><Textarea rows={2} value={config.robustness.blockedActionReply} onChange={(e) => update((d) => { d.robustness.blockedActionReply = e.target.value; })} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">What the model sees</CardTitle>
          <CardDescription>The prompt composed from the settings above ({composed.length.toLocaleString()} characters). Platform rules on grounding, refusal and language are added around it.</CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-gray-950 p-4 text-xs leading-relaxed text-gray-100">{composed}</pre>
          {legacySystemPrompt && <p className="mt-2 text-xs text-amber-700">The legacy system prompt from Settings is still appended as additional notes ({legacySystemPrompt.length} characters). Move its content into the sections above and clear it.</p>}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button onClick={save} disabled={saving || !dirty}>{saving ? "Saving..." : "Save draft"}</Button>
      </div>
    </div>
  );
}
