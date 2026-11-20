/**
 * Pure presentation data for the four learning-moment kinds (ADR-0018): the capture prompt
 * (AC1) and the adaptive field labels. Kept here (no React, no Supabase) so the copy is
 * unit-tested and the form stays a humble renderer of this config.
 */
import { LEARNING_MOMENT_KINDS, type LearningMomentKind } from "./types";

export type KindPresentation = {
  /** Short label for the kind selector. */
  label: string;
  /** The capture prompt shown as the form's headline (AC1 for `speed`). */
  prompt: string;
  /** Adaptive label for the `shift` field (AC2's "what was learned"). */
  shiftLabel: string;
  /** Whether the `duration` field is shown/collected for this kind. */
  showsDuration: boolean;
};

const PRESENTATIONS: Record<LearningMomentKind, KindPresentation> = {
  speed: {
    label: "Got up to speed fast",
    prompt: "Tell us about a time you got up to speed quickly.",
    shiftLabel: "What you learned",
    showsDuration: true,
  },
  insight: {
    label: "Something clicked",
    prompt: "Tell us about a moment when something finally clicked.",
    shiftLabel: "What clicked",
    showsDuration: false,
  },
  pivot: {
    label: "Changed course",
    prompt: "Tell us about a time you changed course on new information.",
    shiftLabel: "What you changed",
    showsDuration: false,
  },
  transfer: {
    label: "Brought a skill across",
    prompt: "Tell us about a skill from a past role you brought into this one.",
    shiftLabel: "What you brought across",
    showsDuration: false,
  },
};

/** The presentation config for one kind. */
export function presentationFor(kind: LearningMomentKind): KindPresentation {
  return PRESENTATIONS[kind];
}

/** All kinds with their presentation, in display order — for the kind selector. */
export function allKindPresentations(): Array<
  { kind: LearningMomentKind } & KindPresentation
> {
  return LEARNING_MOMENT_KINDS.map((kind) => ({
    kind,
    ...PRESENTATIONS[kind],
  }));
}
