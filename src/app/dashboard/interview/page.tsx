import { redirect } from "next/navigation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { createClient } from "@/lib/supabase/server";
import { getTargetRoles } from "@/lib/target-roles/queries";
import { getProjects } from "@/lib/projects/queries";
import {
  getLatestInterviewSession,
  getTurnsForSession,
  getProjectTimelineFiles,
  type InterviewTurnRow,
} from "@/lib/interview/queries";
import { draftTimeline } from "@/lib/interview/timeline";
import { serifStack, brand } from "@/theme-tokens";
import AnswerForm from "./AnswerForm";
import PlaybackGate from "./PlaybackGate";
import StartForm from "./StartForm";
import TimelineReview from "./TimelineReview";
import { resumeAction } from "./actions";

const PAGE_SX = {
  px: { xs: 2, md: 7 },
  py: { xs: 4, md: 6 },
  maxWidth: 1180,
} as const;

const UPPER_LABEL_SX = {
  textTransform: "uppercase",
  letterSpacing: 0.8,
  fontSize: 12,
  fontWeight: 700,
  color: brand.tag.blue.fg,
} as const;

function PageHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <Stack spacing={1}>
      <Typography
        component="h1"
        sx={{ fontFamily: serifStack, fontSize: { xs: 30, md: 44 }, m: 0 }}
      >
        {title}
      </Typography>
      <Typography color="text.secondary">{subtitle}</Typography>
    </Stack>
  );
}

function SidePanel({ asked, budget }: { asked: number; budget: number }) {
  return (
    <Stack spacing={2} sx={{ width: { xs: "100%", md: 300 }, flexShrink: 0 }}>
      <Card variant="outlined">
        <CardContent>
          <Typography sx={UPPER_LABEL_SX}>Session</Typography>
          <Typography
            sx={{
              fontFamily: serifStack,
              fontSize: 36,
              lineHeight: 1.1,
              mt: 1,
            }}
          >
            {asked} of ~{budget}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            questions
          </Typography>
        </CardContent>
      </Card>
      <Card variant="outlined" sx={{ bgcolor: "transparent" }}>
        <CardContent>
          <Typography variant="body2" color="text.secondary">
            The agent never suggests answers. Anything you say stays marked
            “your recollection” until a file supports it.
          </Typography>
        </CardContent>
      </Card>
    </Stack>
  );
}

function QuestionCard({ turn }: { turn: InterviewTurnRow }) {
  return (
    <Card
      variant="outlined"
      sx={{ bgcolor: brand.tag.blue.bg, borderColor: brand.tag.blue.bg }}
    >
      <CardContent>
        <Stack spacing={1.5}>
          {turn.grounding_citation ? (
            <Typography sx={UPPER_LABEL_SX}>
              Looking at your {turn.grounding_citation.title}
            </Typography>
          ) : null}
          <Typography sx={{ fontSize: { xs: 18, md: 20 }, lineHeight: 1.5 }}>
            {turn.question_text}
          </Typography>
        </Stack>
      </CardContent>
    </Card>
  );
}

function DraftField({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <Box>
      <Typography
        component="span"
        sx={{ fontWeight: 700, fontSize: 13, color: "text.secondary" }}
      >
        {label}:{" "}
      </Typography>
      <Typography component="span" sx={{ fontSize: 15 }}>
        {value}
      </Typography>
    </Box>
  );
}

function PlaybackCard({ turn }: { turn: InterviewTurnRow }) {
  const draft = turn.paraphrase;
  return (
    <Card
      variant="outlined"
      sx={{ borderLeft: `4px solid ${brand.sidebarBg}`, bgcolor: "#fff" }}
    >
      <CardContent>
        <Stack spacing={1.5}>
          <Typography sx={{ ...UPPER_LABEL_SX, color: brand.sidebarBg }}>
            Here&rsquo;s what I understood
          </Typography>
          {draft ? (
            <Stack spacing={0.75}>
              <Typography sx={{ fontFamily: serifStack, fontSize: 18 }}>
                {draft.title}
              </Typography>
              <DraftField label="Situation" value={draft.situation} />
              <DraftField label="Cue" value={draft.cue} />
              <DraftField label="Decision" value={draft.decision} />
              <DraftField label="Why" value={draft.why} />
              <DraftField label="Outcome" value={draft.outcome} />
            </Stack>
          ) : null}
          <Typography variant="body2" color="text.secondary">
            Saved as “your recollection” (self-reported) until a file supports
            it.
          </Typography>
          <PlaybackGate sessionId={turn.session_id} />
        </Stack>
      </CardContent>
    </Card>
  );
}

export default async function InterviewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const roles = await getTargetRoles(supabase, user.id);
  const roleOptions = roles.map((r) => ({
    id: r.id,
    title: r.title,
    company: r.company,
  }));
  const projects = await getProjects(supabase, user.id);
  const projectOptions = projects.map((p) => ({ id: p.id, name: p.name }));

  const session = await getLatestInterviewSession(supabase);
  const turns = session ? await getTurnsForSession(supabase, session.id) : [];
  const latest = turns.length > 0 ? turns[turns.length - 1] : null;

  // No session, or the last one is finished: offer to start a new interview.
  if (!session || session.status === "complete") {
    return (
      <Box sx={PAGE_SX}>
        <Stack spacing={4}>
          <PageHeading
            title="Reasoning interview"
            subtitle="One project at a time. I ask about a decision you made; you answer in your own words."
          />
          {session?.status === "complete" ? (
            <Typography variant="body2" color="text.secondary">
              You finished “{session.title}” — {session.asked_count} question
              {session.asked_count === 1 ? "" : "s"} captured. Your saved
              records are on your <Link href="/dashboard">profile</Link>. Start
              another below.
            </Typography>
          ) : null}
          <StartForm roles={roleOptions} projects={projectOptions} />
        </Stack>
      </Box>
    );
  }

  // Timeline phase (ADR-0021): an active, project-backed session with no confirmed timeline and
  // no turns yet. Draft the timeline from the project's files and let the user correct it first.
  if (
    session.status === "active" &&
    session.project_id &&
    !session.timeline &&
    turns.length === 0
  ) {
    const files = await getProjectTimelineFiles(
      supabase,
      user.id,
      session.project_id
    );
    const draft = draftTimeline(files);
    return (
      <Box sx={PAGE_SX}>
        <Stack spacing={4} sx={{ maxWidth: 760 }}>
          <PageHeading
            title={`${session.title}: your timeline`}
            subtitle="We map out the project first, then talk through the decisions at each point."
          />
          <TimelineReview sessionId={session.id} draft={draft} />
        </Stack>
      </Box>
    );
  }

  const title = `${session.title}, in your words`;
  const subtitle =
    "One project at a time. Answer in your own words; skip anything, anytime.";

  return (
    <Box sx={PAGE_SX}>
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={4}
        sx={{ alignItems: "flex-start" }}
      >
        <Stack spacing={3} sx={{ flex: 1, minWidth: 0, maxWidth: 760 }}>
          <PageHeading title={title} subtitle={subtitle} />

          {session.status === "paused" ? (
            <Card variant="outlined" sx={{ bgcolor: "#fff" }}>
              <CardContent>
                <Stack spacing={2}>
                  <Typography>
                    This interview is paused. Your progress is saved — resume
                    when you&rsquo;re ready.
                  </Typography>
                  <Box component="form" action={resumeAction}>
                    <input type="hidden" name="session_id" value={session.id} />
                    <Button type="submit" variant="contained">
                      Resume interview
                    </Button>
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          ) : latest && latest.status === "answered" && latest.paraphrase ? (
            <>
              <QuestionCard turn={latest} />
              <PlaybackCard turn={latest} />
            </>
          ) : latest ? (
            <>
              <QuestionCard turn={latest} />
              <AnswerForm sessionId={session.id} />
            </>
          ) : (
            <Typography color="text.secondary">
              Preparing your first question…
            </Typography>
          )}
        </Stack>

        <SidePanel
          asked={session.asked_count}
          budget={session.question_budget}
        />
      </Stack>
    </Box>
  );
}
