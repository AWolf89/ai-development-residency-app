import { describe, it, expect, vi } from "vitest";
import { saveProject, type ProjectRepository } from "./save";

// Supabase access is behind an interface (Dependency Inversion); inject a fake —
// no network, no real project, no credentials.
function makeFakeRepo(
  overrides: Partial<ProjectRepository> = {}
): ProjectRepository {
  return {
    insertProject: vi.fn(async () => ({ id: "new-project-id" })),
    updateProject: vi.fn(async () => {}),
    ...overrides,
  };
}

const userId = "11111111-1111-1111-1111-111111111111";
const validInput = {
  name: "Acme relaunch",
  role: "Tech lead",
  organisation: "Acme Inc",
  summary: "Rebuilt the site.",
  status: "active",
  startedOn: "2024-01-15",
  endedOn: "2025-03-01",
};

describe("saveProject", () => {
  it("inserts a new project and returns its id", async () => {
    const repo = makeFakeRepo();
    const result = await saveProject(repo, { userId, input: validInput });

    expect(result).toEqual({ ok: true, projectId: "new-project-id" });
    expect(repo.insertProject).toHaveBeenCalledOnce();
    expect(repo.insertProject).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: userId,
        name: "Acme relaunch",
        role: "Tech lead",
        organisation: "Acme Inc",
        summary: "Rebuilt the site.",
        status: "active",
        started_on: "2024-01-15",
        ended_on: "2025-03-01",
      })
    );
    expect(repo.updateProject).not.toHaveBeenCalled();
  });

  it("updates an existing project when a projectId is given", async () => {
    const repo = makeFakeRepo();
    const result = await saveProject(repo, {
      userId,
      input: validInput,
      projectId: "existing-id",
    });

    expect(result).toEqual({ ok: true, projectId: "existing-id" });
    expect(repo.updateProject).toHaveBeenCalledWith(
      "existing-id",
      expect.objectContaining({ user_id: userId, name: "Acme relaunch" })
    );
    expect(repo.insertProject).not.toHaveBeenCalled();
  });

  it("writes nothing and returns the error when validation fails", async () => {
    const repo = makeFakeRepo();
    const result = await saveProject(repo, {
      userId,
      input: { name: "   " },
    });

    expect(result.ok).toBe(false);
    expect(repo.insertProject).not.toHaveBeenCalled();
    expect(repo.updateProject).not.toHaveBeenCalled();
  });

  it("stamps the caller's user id, ignoring any user_id in the input", async () => {
    const repo = makeFakeRepo();
    await saveProject(repo, {
      userId,
      input: {
        ...validInput,
        user_id: "99999999-9999-9999-9999-999999999999",
        userId: "99999999-9999-9999-9999-999999999999",
      },
    });

    expect(repo.insertProject).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: userId })
    );
  });

  it("defaults status and nulls optionals for a minimal project", async () => {
    const repo = makeFakeRepo();
    await saveProject(repo, { userId, input: { name: "Solo thing" } });

    expect(repo.insertProject).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: userId,
        name: "Solo thing",
        role: null,
        organisation: null,
        summary: null,
        status: "active",
        started_on: null,
        ended_on: null,
      })
    );
  });
});
