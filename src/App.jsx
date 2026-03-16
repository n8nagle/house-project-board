import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";

const DEFAULT_PROJECTS = [
  "Gutter/flashing repair",
  "Repointing brick",
  "Close in back porch",
  "Remodel upstairs bathroom",
  "Remodel downstairs bathroom",
  "Built-in in living room",
  "Remodel kitchen",
  "Build outdoor cooking area",
  "Remodel foyer area",
  "Organize unfinished basement",
  "Install gas fireplace in existing basement fireplace",
  "Build tiered gardens in backyard",
  "Trim bushes",
  "Expand garden in front yard",
  "Repair sidewalks",
  "Fix garage door",
  "Replace front door",
  "Paint garage",
  "Paint 2nd floor",
  "Replace dining room window",
  "Replace master bedroom window",
  "Replace 2nd floor hallways window",
  "Replace Jo room windows",
  "Replace spare room windows",
  "Replace attic windows",
  "Install minisplits",
  "Organize attic",
  "Refinish floors",
  "Build Jo's big girl bed",
  "Repair master walk in closet",
  "Replace 2 prong outlets",
  "Install master bedroom fan",
  "Install fan at top of stairs",
  "Install fan in Jo's room",
  "Install fan in spare room",
];

const PEOPLE = ["Nate", "Amanda"];
const STORAGE_KEY = "house-project-priority-board-v4";
const DEFAULT_RATING = 3;
const BOARD_PADDING_PCT = 6;

function makeProject(name, index) {
  return {
    id: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${index}-${Math.random()
      .toString(36)
      .slice(2, 7)}`,
    name,
    status: "active",
    ratings: {
      Nate: { effort: DEFAULT_RATING, impact: DEFAULT_RATING },
      Amanda: { effort: DEFAULT_RATING, impact: DEFAULT_RATING },
    },
    touched: {
      Nate: false,
      Amanda: false,
    },
    createdAt: Date.now() + index,
  };
}

function getInitialProjects() {
  return DEFAULT_PROJECTS.map((name, index) => makeProject(name, index));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function averageRatings(project) {
  const nate = project.ratings.Nate;
  const amanda = project.ratings.Amanda;
  return {
    effort: Number(((nate.effort + amanda.effort) / 2).toFixed(1)),
    impact: Number(((nate.impact + amanda.impact) / 2).toFixed(1)),
  };
}

function priorityScore(project) {
  const avg = averageRatings(project);
  return Number((avg.impact * 3 - avg.effort).toFixed(1));
}

function disagreementScore(project) {
  const nate = project.ratings.Nate;
  const amanda = project.ratings.Amanda;
  return Math.abs(nate.effort - amanda.effort) + Math.abs(nate.impact - amanda.impact);
}

function disagreementLabel(project) {
  const score = disagreementScore(project);
  if (score <= 1) return "Low";
  if (score <= 3) return "Medium";
  return "High";
}

function markerPosition(rating) {
  const usable = 100 - BOARD_PADDING_PCT * 2;
  const left = BOARD_PADDING_PCT + ((rating.effort - 1) / 4) * usable;
  const top = BOARD_PADDING_PCT + (1 - (rating.impact - 1) / 4) * usable;
  return {
    left: clamp(left, BOARD_PADDING_PCT, 100 - BOARD_PADDING_PCT),
    top: clamp(top, BOARD_PADDING_PCT, 100 - BOARD_PADDING_PCT),
  };
}

function exportData(projects) {
  const blob = new Blob([JSON.stringify(projects, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "house-project-priorities.json";
  link.click();
  URL.revokeObjectURL(url);
}

function sortProjects(projects) {
  return [...projects].sort((a, b) => {
    const scoreDiff = priorityScore(b) - priorityScore(a);
    if (scoreDiff !== 0) return scoreDiff;
    return a.name.localeCompare(b.name);
  });
}

function isUnratedByPerson(project, person) {
  return !project.touched?.[person];
}

function isFullyUnrated(project) {
  return PEOPLE.some((person) => isUnratedByPerson(project, person));
}

function getClusterOffsets(index, total, radius = 14) {
  if (total <= 1) return { x: 0, y: 0 };
  const angle = (index / total) * Math.PI * 2;
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  };
}

function normalizeProjectRow(row) {
  return {
    id: row.id,
    name: row.name,
    status: row.status ?? "active",
    ratings: row.ratings ?? {
      Nate: { effort: DEFAULT_RATING, impact: DEFAULT_RATING },
      Amanda: { effort: DEFAULT_RATING, impact: DEFAULT_RATING },
    },
    touched: row.touched ?? { Nate: false, Amanda: false },
    createdAt: row.created_at ?? Date.now(),
  };
}

function projectToRow(project) {
  return {
    id: project.id,
    name: project.name,
    status: project.status,
    ratings: project.ratings,
    touched: project.touched,
    created_at: project.createdAt,
  };
}

export default function HouseProjectPriorityApp() {
  const [projects, setProjects] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [activeTab, setActiveTab] = useState("active");
  const [currentPerson, setCurrentPerson] = useState("Nate");
  const [newProjectName, setNewProjectName] = useState("");
  const [search, setSearch] = useState("");
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    async function loadProjects() {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Supabase load failed:", error);
        const saved = window.localStorage.getItem(STORAGE_KEY);
        if (saved) {
          try {
            setProjects(JSON.parse(saved));
          } catch {
            setProjects(getInitialProjects());
          }
        } else {
          setProjects(getInitialProjects());
        }
        setIsLoaded(true);
        return;
      }

      if (!data || data.length === 0) {
        const starter = getInitialProjects();
        setProjects(starter);

        const { error: seedError } = await supabase
          .from("projects")
          .upsert(starter.map(projectToRow));

        if (seedError) {
          console.error("Supabase seed failed:", seedError);
        }
      } else {
        setProjects(data.map(normalizeProjectRow));
      }

      setIsLoaded(true);
    }

    loadProjects();
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  }, [projects, isLoaded]);

  async function saveProjects(updatedProjects) {
    setProjects(updatedProjects);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedProjects));

    const { error } = await supabase
      .from("projects")
      .upsert(updatedProjects.map(projectToRow));

    if (error) {
      console.error("Supabase save failed:", error);
    }
  }

  async function deleteProjectFromSupabase(id) {
    const { error } = await supabase.from("projects").delete().eq("id", id);
    if (error) {
      console.error("Supabase delete failed:", error);
    }
  }

  const activeProjects = useMemo(() => projects.filter((p) => p.status === "active"), [projects]);
  const completedProjects = useMemo(() => projects.filter((p) => p.status === "completed"), [projects]);

  const visibleProjects = useMemo(() => {
    const base = activeTab === "active" ? activeProjects : completedProjects;
    return sortProjects(base.filter((p) => p.name.toLowerCase().includes(search.toLowerCase())));
  }, [activeProjects, completedProjects, activeTab, search]);

  const rankedActiveProjects = useMemo(() => sortProjects(activeProjects), [activeProjects]);
  const topFiveProjects = useMemo(() => rankedActiveProjects.slice(0, 5), [rankedActiveProjects]);

  const selectedProject = projects.find((p) => p.id === selectedId) ?? null;

  const clusteredActiveProjects = useMemo(() => {
    const groups = new Map();
    activeProjects.forEach((project) => {
      const avg = averageRatings(project);
      const key = `${avg.effort}-${avg.impact}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(project);
    });

    const clusterMap = new Map();
    groups.forEach((group) => {
      group.forEach((project, index) => {
        clusterMap.set(project.id, {
          count: group.length,
          index,
          offset: getClusterOffsets(index, group.length),
        });
      });
    });
    return clusterMap;
  }, [activeProjects]);

  function updateRating(person, field, value) {
    if (!selectedProject) return;

    const updated = projects.map((p) =>
      p.id === selectedProject.id
        ? {
            ...p,
            ratings: {
              ...p.ratings,
              [person]: {
                ...p.ratings[person],
                [field]: Number(value),
              },
            },
            touched: {
              ...p.touched,
              [person]: true,
            },
          }
        : p
    );

    saveProjects(updated);
  }

  function addProject() {
    const trimmed = newProjectName.trim();
    if (!trimmed) return;

    const project = makeProject(trimmed, projects.length);
    const updated = [...projects, project];
    saveProjects(updated);
    setSelectedId(project.id);
    setNewProjectName("");
    setActiveTab("active");
  }

  function markCompleted(id) {
    const updated = projects.map((pr) =>
      pr.id === id ? { ...pr, status: "completed" } : pr
    );
    saveProjects(updated);
    if (selectedId === id) setSelectedId(null);
  }

  function restoreProject(id) {
    const updated = projects.map((pr) =>
      pr.id === id ? { ...pr, status: "active" } : pr
    );
    saveProjects(updated);
    setSelectedId(id);
    setActiveTab("active");
  }

  function deleteProject(id) {
    const updated = projects.filter((pr) => pr.id !== id);
    saveProjects(updated);
    deleteProjectFromSupabase(id);
    if (selectedId === id) setSelectedId(null);
  }

  function jumpToNextUnrated() {
    const next = rankedActiveProjects.find((project) => isUnratedByPerson(project, currentPerson));
    if (next) {
      setSelectedId(next.id);
      return;
    }
    const fallback = rankedActiveProjects.find((project) => isFullyUnrated(project));
    if (fallback) setSelectedId(fallback.id);
  }

  async function resetAll() {
    const fresh = getInitialProjects();
    setProjects(fresh);
    setSelectedId(null);
    setActiveTab("active");
    setCurrentPerson("Nate");
    setNewProjectName("");
    setSearch("");

    await supabase.from("projects").delete().neq("id", "");
    await supabase.from("projects").upsert(fresh.map(projectToRow));
  }

  const avg = selectedProject ? averageRatings(selectedProject) : null;
  const nextUnratedExists = rankedActiveProjects.some((project) => isUnratedByPerson(project, currentPerson));

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-slate-100 p-6">
        <div className="mx-auto max-w-3xl rounded-3xl border bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-bold">Loading house project board...</h1>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-3xl border bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">House Project Priority Board</h1>
              <p className="mt-2 text-slate-600">Effort increases to the right. Impact increases upward.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => exportData(projects)}
                className="rounded-2xl bg-slate-200 px-4 py-2 font-medium transition hover:bg-slate-300"
              >
                Export JSON
              </button>
              <button
                onClick={resetAll}
                className="rounded-2xl bg-rose-100 px-4 py-2 font-medium transition hover:bg-rose-200"
              >
                Reset Demo Data
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
          <div className="space-y-6">
            <div className="rounded-3xl border bg-white p-5 shadow-sm">
              <div className="mb-4 flex gap-2">
                <button
                  onClick={() => setActiveTab("active")}
                  className={`rounded-xl px-3 py-1 ${activeTab === "active" ? "bg-slate-900 text-white" : "bg-slate-200"}`}
                >
                  Active ({activeProjects.length})
                </button>
                <button
                  onClick={() => setActiveTab("completed")}
                  className={`rounded-xl px-3 py-1 ${activeTab === "completed" ? "bg-slate-900 text-white" : "bg-slate-200"}`}
                >
                  Completed ({completedProjects.length})
                </button>
              </div>

              <div className="space-y-3">
                <div className="flex gap-2">
                  <input
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") addProject();
                    }}
                    placeholder="Add project"
                    className="w-full rounded-xl border px-3 py-2 outline-none focus:ring-2 focus:ring-slate-300"
                  />
                  <button onClick={addProject} className="rounded-xl bg-slate-900 px-4 py-2 text-white">
                    Add
                  </button>
                </div>

                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search projects"
                  className="w-full rounded-xl border px-3 py-2 outline-none focus:ring-2 focus:ring-slate-300"
                />
              </div>

              <div className="mt-4 max-h-[420px] space-y-2 overflow-auto pr-1">
                {visibleProjects.map((project) => {
                  const avgRatings = averageRatings(project);
                  return (
                    <button
                      key={project.id}
                      onClick={() => setSelectedId(project.id)}
                      className={`w-full rounded-xl border p-3 text-left transition ${
                        selectedId === project.id ? "bg-slate-900 text-white" : "bg-slate-50 hover:bg-slate-100"
                      }`}
                    >
                      <div className="font-medium leading-tight">{project.name}</div>
                      <div className="mt-1 text-xs opacity-70">
                        Avg {avgRatings.effort}/{avgRatings.impact}
                        {project.status === "active" ? ` · ${disagreementLabel(project)} disagreement` : ""}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {selectedProject && (
              <div className="space-y-4 rounded-3xl border bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold">{selectedProject.name}</div>
                    <div className="mt-1 text-sm text-slate-600">
                      {selectedProject.status === "active"
                        ? `${disagreementLabel(selectedProject)} disagreement · Score ${priorityScore(selectedProject)}`
                        : "Completed project"}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {PEOPLE.map((person) => (
                      <button
                        key={person}
                        onClick={() => setCurrentPerson(person)}
                        className={`rounded-xl px-3 py-1 ${currentPerson === person ? "bg-slate-900 text-white" : "bg-slate-200"}`}
                      >
                        {person}
                      </button>
                    ))}
                  </div>
                </div>

                {selectedProject.status === "active" && (
                  <div className="space-y-4 rounded-2xl border bg-slate-50 p-4">
                    <div>
                      <div className="mb-1 flex justify-between text-sm">
                        <span>Effort</span>
                        <span>{selectedProject.ratings[currentPerson].effort}</span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="5"
                        value={selectedProject.ratings[currentPerson].effort}
                        onChange={(e) => updateRating(currentPerson, "effort", e.target.value)}
                        className="w-full"
                      />
                    </div>

                    <div>
                      <div className="mb-1 flex justify-between text-sm">
                        <span>Impact</span>
                        <span>{selectedProject.ratings[currentPerson].impact}</span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="5"
                        value={selectedProject.ratings[currentPerson].impact}
                        onChange={(e) => updateRating(currentPerson, "impact", e.target.value)}
                        className="w-full"
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                      <div className="rounded-xl border bg-white p-3">
                        <div className="text-slate-500">Average</div>
                        <div className="mt-1 font-semibold">Effort {avg?.effort} / Impact {avg?.impact}</div>
                      </div>
                      <div className="rounded-xl border bg-white p-3">
                        <div className="text-slate-500">Raters done</div>
                        <div className="mt-1 font-semibold">
                          {selectedProject.touched.Nate ? "Nate" : ""}
                          {selectedProject.touched.Nate && selectedProject.touched.Amanda ? " + " : ""}
                          {selectedProject.touched.Amanda ? "Amanda" : ""}
                          {!selectedProject.touched.Nate && !selectedProject.touched.Amanda ? "None yet" : ""}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {selectedProject.status === "active" && (
                  <div className="rounded-2xl border bg-slate-50 p-4">
                    <div className="mb-2 text-sm font-semibold">Selected project markers</div>
                    <div className="flex flex-wrap items-center gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="inline-block h-3.5 w-3.5 rounded-full border border-white bg-sky-500 shadow" />
                        <span>Nate</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="inline-block h-3.5 w-3.5 rounded-full border border-white bg-rose-500 shadow" />
                        <span>Amanda</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="inline-block h-4 w-4 rounded-full border-2 border-white bg-slate-900 shadow" />
                        <span>Average</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap gap-3">
                  {selectedProject.status === "active" ? (
                    <>
                      <button
                        onClick={jumpToNextUnrated}
                        disabled={!nextUnratedExists}
                        className={`rounded-xl px-3 py-2 font-medium ${
                          nextUnratedExists ? "bg-sky-100 hover:bg-sky-200" : "cursor-not-allowed bg-slate-100 text-slate-400"
                        }`}
                      >
                        Jump to next unrated for {currentPerson}
                      </button>
                      <button
                        onClick={() => markCompleted(selectedProject.id)}
                        className="rounded-xl bg-emerald-200 px-3 py-2 font-medium hover:bg-emerald-300"
                      >
                        Mark Completed
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => restoreProject(selectedProject.id)}
                      className="rounded-xl bg-sky-100 px-3 py-2 font-medium hover:bg-sky-200"
                    >
                      Restore to Active
                    </button>
                  )}

                  <button
                    onClick={() => deleteProject(selectedProject.id)}
                    className="rounded-xl bg-rose-100 px-3 py-2 font-medium hover:bg-rose-200"
                  >
                    Delete Project
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="rounded-3xl border bg-white p-5 shadow-sm">
              <div className="mb-4">
                <h2 className="text-xl font-semibold">Impact vs. Effort Matrix</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Main view uses black average markers. Selecting a project reveals Nate and Amanda in color.
                </p>
              </div>

              <div className="relative h-[520px] overflow-hidden rounded-3xl border bg-slate-50">
                <div className="pointer-events-none absolute inset-0 grid grid-cols-2 grid-rows-2">
                  <div className="border-b border-r bg-emerald-50/70" />
                  <div className="border-b bg-amber-50/70" />
                  <div className="border-r bg-slate-100/70" />
                  <div className="bg-rose-50/70" />
                </div>

                <div className="absolute left-6 top-4 z-10 rounded-lg bg-white/80 px-2 py-1 text-sm font-semibold backdrop-blur-sm">Do First</div>
                <div className="absolute right-6 top-4 z-10 rounded-lg bg-white/80 px-2 py-1 text-sm font-semibold backdrop-blur-sm">Big Wins</div>
                <div className="absolute bottom-8 left-6 z-10 rounded-lg bg-white/80 px-2 py-1 text-sm font-semibold backdrop-blur-sm">Low Return</div>
                <div className="absolute bottom-8 right-6 z-10 rounded-lg bg-white/80 px-2 py-1 text-sm font-semibold backdrop-blur-sm">Not Yet</div>

                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-slate-300" />
                <div className="absolute left-0 right-0 top-1/2 h-px bg-slate-300" />

                <div className="pointer-events-none absolute bottom-2 left-5 right-5 z-10 flex justify-between text-xs text-slate-500">
                  <span className="rounded-md bg-white/80 px-2 py-1">Lower effort</span>
                  <span className="rounded-md bg-white/80 px-2 py-1">Higher effort</span>
                </div>
                <div className="pointer-events-none absolute bottom-12 left-2 top-12 z-10 flex flex-col justify-between text-xs text-slate-500">
                  <span className="origin-left -rotate-90 rounded-md bg-white/80 px-2 py-1 translate-x-[-4px]">Higher impact</span>
                  <span className="origin-left -rotate-90 rounded-md bg-white/80 px-2 py-1 translate-x-[-4px]">Lower impact</span>
                </div>

                {activeProjects.map((project) => {
                  const avgPos = markerPosition(averageRatings(project));
                  const cluster = clusteredActiveProjects.get(project.id) ?? { offset: { x: 0, y: 0 } };
                  const isSelected = selectedProject?.id === project.id;

                  return (
                    <div
                      key={project.id}
                      className="absolute"
                      style={{
                        left: `calc(${avgPos.left}% + ${cluster.offset.x}px)`,
                        top: `calc(${avgPos.top}% + ${cluster.offset.y}px)`,
                        transform: "translate(-50%, -50%)",
                        zIndex: isSelected ? 20 : 10,
                      }}
                    >
                      <button
                        onClick={() => setSelectedId(project.id)}
                        className={`relative rounded-full border-2 border-white shadow ${
                          isSelected ? "h-6 w-6 bg-slate-900" : "h-5 w-5 bg-slate-800"
                        }`}
                        title={project.name}
                      />
                    </div>
                  );
                })}

                {selectedProject && selectedProject.status === "active" && (() => {
                  const natePos = markerPosition(selectedProject.ratings.Nate);
                  const amandaPos = markerPosition(selectedProject.ratings.Amanda);

                  return (
                    <>
                      <div
                        className="absolute h-4 w-4 rounded-full border-2 border-white bg-sky-500 shadow"
                        style={{
                          left: `${natePos.left}%`,
                          top: `${natePos.top}%`,
                          transform: "translate(-50%, -50%)",
                          zIndex: 40,
                        }}
                      />
                      <div
                        className="absolute h-4 w-4 rounded-full border-2 border-white bg-rose-500 shadow"
                        style={{
                          left: `${amandaPos.left}%`,
                          top: `${amandaPos.top}%`,
                          transform: "translate(-50%, -50%)",
                          zIndex: 41,
                        }}
                      />
                    </>
                  );
                })()}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="rounded-3xl border bg-white p-5 shadow-sm">
                <h2 className="mb-3 font-semibold">Ranked Projects</h2>
                <div className="max-h-[320px] overflow-auto rounded-xl border">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-slate-100">
                      <tr>
                        <th className="px-3 py-2 text-left">Rank</th>
                        <th className="px-3 py-2 text-left">Project</th>
                        <th className="px-3 py-2 text-left">Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rankedActiveProjects.map((project, index) => (
                        <tr key={project.id} className="border-t">
                          <td className="px-3 py-2">{index + 1}</td>
                          <td className="px-3 py-2">{project.name}</td>
                          <td className="px-3 py-2">{priorityScore(project)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-3xl border bg-white p-5 shadow-sm">
                <h2 className="mb-3 font-semibold">Top 5 Next Projects</h2>
                <div className="space-y-2">
                  {topFiveProjects.map((project, index) => (
                    <button
                      key={project.id}
                      onClick={() => setSelectedId(project.id)}
                      className="w-full rounded-xl border bg-slate-50 px-3 py-3 text-left hover:bg-slate-100"
                    >
                      <div className="text-xs text-slate-500">#{index + 1}</div>
                      <div className="mt-1 font-medium leading-tight">{project.name}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        Score {priorityScore(project)} · {disagreementLabel(project)} disagreement
                      </div>
                    </button>
                  ))}
                  {topFiveProjects.length === 0 && (
                    <div className="rounded-xl border border-dashed bg-slate-50 p-4 text-sm text-slate-500">
                      No active projects yet.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Sync status</h2>
          <p className="mt-2 text-sm text-slate-600">
            This version saves to Supabase, so you and Amanda can use the same shared board from different devices.
          </p>
        </div>
      </div>
    </div>
  );
}
