import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Chip from "@mui/material/Chip";

export default function Home() {
  return (
    <Box
      component="main"
      sx={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        py: 8,
      }}
    >
      <Container maxWidth="md">
        <Stack spacing={3} sx={{ alignItems: "flex-start" }}>
          <Chip label="MVP #1 · In development" color="secondary" variant="outlined" />
          <Typography variant="h2" component="h1">
            Career Evidence Agent
          </Typography>
          <Typography variant="h6" component="p" color="text.secondary">
            Turn hidden experience into defensible, honest evidence for
            interviews and portfolios.
          </Typography>
          <Typography variant="body1" color="text.secondary">
            The agent draws out the reasoning behind your work through targeted
            questions, checks claims against real evidence, and builds a record
            you can stand behind.
          </Typography>
          <Stack direction="row" spacing={2}>
            <Button variant="contained" size="large" disabled>
              Get started
            </Button>
            <Button variant="outlined" size="large" disabled>
              Learn more
            </Button>
          </Stack>
          <Typography variant="caption" color="text.disabled">
            Foundation scaffold (E1). Features arrive as the backlog is built
            out.
          </Typography>
        </Stack>
      </Container>
    </Box>
  );
}
