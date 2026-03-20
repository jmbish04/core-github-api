import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Edit, Loader2, Plus, Search, Trash2 } from "lucide-react";

type ScopeTag = {
  id: number;
  name: string;
  description: string;
  hexColor: string;
};

type ScopeItem = {
  id: number;
  title: string;
  description: string;
  infrastructure: string;
  hexColor: string;
  tags: ScopeTag[];
};

type ConfigItem = {
  id: number;
  title: string;
  description: string;
  rule: string;
  scope: ScopeItem;
};

type TagItem = {
  id: number;
  name: string;
  description: string;
  isActive: boolean;
  hexColor: string;
};

type ConfigFormState = {
  title: string;
  description: string;
  rule: string;
  scopeId: string;
};

type ScopeFormState = {
  title: string;
  description: string;
  infrastructure: string;
  hexColor: string;
  tagIds: number[];
};

type TagFormState = {
  name: string;
  description: string;
  hexColor: string;
  isActive: boolean;
};

const CONFIGS_KEY = "golden-path-configs";
const SCOPES_KEY = "golden-path-scopes";
const TAGS_KEY = "golden-path-tags";

function defaultConfigForm(): ConfigFormState {
  return { title: "", description: "", rule: "", scopeId: "" };
}

function defaultScopeForm(): ScopeFormState {
  return {
    title: "",
    description: "",
    infrastructure: "",
    hexColor: "#2563eb",
    tagIds: [],
  };
}

function defaultTagForm(): TagFormState {
  return {
    name: "",
    description: "",
    hexColor: "#7c3aed",
    isActive: true,
  };
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: { "content-type": "application/json", ...(init?.headers || {}) },
    ...init,
  });

  const payload = (await response.json()) as T & { success?: boolean; error?: string };
  if (!response.ok || (typeof payload === "object" && payload && "success" in payload && payload.success === false)) {
    throw new Error((payload as { error?: string }).error || `Request failed for ${url}`);
  }

  return payload;
}

function TagBadge({ tag }: { tag: ScopeTag | TagItem }) {
  return (
    <Badge
      variant="outline"
      className="border-transparent text-white"
      style={{ backgroundColor: tag.hexColor }}
    >
      {tag.name}
    </Badge>
  );
}

export function StandardizationsTab() {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [scopeFilter, setScopeFilter] = useState("all");
  const [infrastructureFilter, setInfrastructureFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");

  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [scopeDialogOpen, setScopeDialogOpen] = useState(false);
  const [tagDialogOpen, setTagDialogOpen] = useState(false);

  const [editingConfig, setEditingConfig] = useState<ConfigItem | null>(null);
  const [editingScope, setEditingScope] = useState<ScopeItem | null>(null);
  const [editingTag, setEditingTag] = useState<TagItem | null>(null);

  const [configForm, setConfigForm] = useState<ConfigFormState>(defaultConfigForm);
  const [scopeForm, setScopeForm] = useState<ScopeFormState>(defaultScopeForm);
  const [tagForm, setTagForm] = useState<TagFormState>(defaultTagForm);

  const configQueryString = useMemo(() => {
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (scopeFilter !== "all") params.set("scope", scopeFilter);
    if (infrastructureFilter !== "all") params.set("infrastructure", infrastructureFilter);
    if (tagFilter !== "all") params.set("tag", tagFilter);
    return params.toString();
  }, [search, scopeFilter, infrastructureFilter, tagFilter]);

  const { data: configsResponse, isLoading: configsLoading } = useQuery({
    queryKey: [CONFIGS_KEY, configQueryString],
    queryFn: () =>
      fetchJson<{ success: boolean; items: ConfigItem[] }>(
        `/api/settings/golden-path/configs${configQueryString ? `?${configQueryString}` : ""}`,
      ),
  });

  const { data: scopesResponse, isLoading: scopesLoading } = useQuery({
    queryKey: [SCOPES_KEY],
    queryFn: () => fetchJson<{ success: boolean; items: ScopeItem[] }>("/api/settings/golden-path/scopes"),
  });

  const { data: tagsResponse, isLoading: tagsLoading } = useQuery({
    queryKey: [TAGS_KEY],
    queryFn: () => fetchJson<{ success: boolean; items: TagItem[] }>("/api/settings/golden-path/tags"),
  });

  const configs = configsResponse?.items || [];
  const scopes = scopesResponse?.items || [];
  const tags = tagsResponse?.items || [];

  const invalidateAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: [CONFIGS_KEY] }),
      queryClient.invalidateQueries({ queryKey: [SCOPES_KEY] }),
      queryClient.invalidateQueries({ queryKey: [TAGS_KEY] }),
      queryClient.invalidateQueries({ queryKey: ["settings"] }),
    ]);
  };

  const saveConfigMutation = useMutation({
    mutationFn: async () => {
      const url = editingConfig
        ? `/api/settings/golden-path/configs/${editingConfig.id}`
        : "/api/settings/golden-path/configs";
      const method = editingConfig ? "PUT" : "POST";
      return fetchJson(url, {
        method,
        body: JSON.stringify({
          title: configForm.title,
          description: configForm.description,
          rule: configForm.rule,
          scopeId: Number(configForm.scopeId),
        }),
      });
    },
    onSuccess: async () => {
      await invalidateAll();
      setConfigDialogOpen(false);
      setEditingConfig(null);
      setConfigForm(defaultConfigForm());
      toast.success("Golden path config saved");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteConfigMutation = useMutation({
    mutationFn: async (id: number) =>
      fetchJson(`/api/settings/golden-path/configs/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await invalidateAll();
      toast.success("Golden path config deleted");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const saveScopeMutation = useMutation({
    mutationFn: async () => {
      const url = editingScope
        ? `/api/settings/golden-path/scopes/${editingScope.id}`
        : "/api/settings/golden-path/scopes";
      const method = editingScope ? "PUT" : "POST";
      return fetchJson(url, {
        method,
        body: JSON.stringify(scopeForm),
      });
    },
    onSuccess: async () => {
      await invalidateAll();
      setScopeDialogOpen(false);
      setEditingScope(null);
      setScopeForm(defaultScopeForm());
      toast.success("Scope saved");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteScopeMutation = useMutation({
    mutationFn: async (id: number) =>
      fetchJson(`/api/settings/golden-path/scopes/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await invalidateAll();
      toast.success("Scope deleted");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const saveTagMutation = useMutation({
    mutationFn: async () => {
      const url = editingTag
        ? `/api/settings/golden-path/tags/${editingTag.id}`
        : "/api/settings/golden-path/tags";
      const method = editingTag ? "PUT" : "POST";
      return fetchJson(url, {
        method,
        body: JSON.stringify(tagForm),
      });
    },
    onSuccess: async () => {
      await invalidateAll();
      setTagDialogOpen(false);
      setEditingTag(null);
      setTagForm(defaultTagForm());
      toast.success("Tag saved");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteTagMutation = useMutation({
    mutationFn: async (id: number) =>
      fetchJson(`/api/settings/golden-path/tags/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await invalidateAll();
      toast.success("Tag deactivated");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const openCreateConfig = () => {
    setEditingConfig(null);
    setConfigForm(defaultConfigForm());
    setConfigDialogOpen(true);
  };

  const openEditConfig = (item: ConfigItem) => {
    setEditingConfig(item);
    setConfigForm({
      title: item.title,
      description: item.description,
      rule: item.rule,
      scopeId: String(item.scope.id),
    });
    setConfigDialogOpen(true);
  };

  const openCreateScope = () => {
    setEditingScope(null);
    setScopeForm(defaultScopeForm());
    setScopeDialogOpen(true);
  };

  const openEditScope = (item: ScopeItem) => {
    setEditingScope(item);
    setScopeForm({
      title: item.title,
      description: item.description,
      infrastructure: item.infrastructure,
      hexColor: item.hexColor,
      tagIds: item.tags.map((tag) => tag.id),
    });
    setScopeDialogOpen(true);
  };

  const openCreateTag = () => {
    setEditingTag(null);
    setTagForm(defaultTagForm());
    setTagDialogOpen(true);
  };

  const openEditTag = (item: TagItem) => {
    setEditingTag(item);
    setTagForm({
      name: item.name,
      description: item.description,
      hexColor: item.hexColor,
      isActive: item.isActive,
    });
    setTagDialogOpen(true);
  };

  const isLoading = configsLoading || scopesLoading || tagsLoading;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Golden Path Configurations</CardTitle>
          <CardDescription>
            Manage the D1-backed frontend, backend, AI, infrastructure, and documentation rules used by coding agents.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2 md:col-span-2">
              <Label>Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search title, description, rule, scope, or tag"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Scope</Label>
              <Select value={scopeFilter} onValueChange={setScopeFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All scopes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All scopes</SelectItem>
                  {scopes.map((scope) => (
                    <SelectItem key={scope.id} value={scope.title}>
                      {scope.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Infrastructure</Label>
              <Select value={infrastructureFilter} onValueChange={setInfrastructureFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All infrastructure" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All infrastructure</SelectItem>
                  {Array.from(new Set(scopes.map((scope) => scope.infrastructure))).map((infrastructure) => (
                    <SelectItem key={infrastructure} value={infrastructure}>
                      {infrastructure}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-[1fr_220px]">
            <div className="space-y-2">
              <Label>Tag</Label>
              <Select value={tagFilter} onValueChange={setTagFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All tags" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All tags</SelectItem>
                  {tags.filter((tag) => tag.isActive).map((tag) => (
                    <SelectItem key={tag.id} value={tag.name}>
                      {tag.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end justify-end">
              <Button onClick={openCreateConfig}>
                <Plus className="mr-2 h-4 w-4" />
                New Config
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            {isLoading ? (
              <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading golden path configuration…
              </div>
            ) : configs.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                No golden path configs matched the current filters.
              </div>
            ) : (
              configs.map((item) => (
                <div key={item.id} className="rounded-lg border p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold">{item.title}</h3>
                        <Badge
                          variant="outline"
                          style={{ borderColor: item.scope.hexColor, color: item.scope.hexColor }}
                        >
                          {item.scope.title}
                        </Badge>
                        <Badge variant="secondary">{item.scope.infrastructure}</Badge>
                        {item.scope.tags.map((tag) => (
                          <TagBadge key={tag.id} tag={tag} />
                        ))}
                      </div>
                      <p className="text-sm text-muted-foreground">{item.description}</p>
                      <pre className="overflow-x-auto rounded-md bg-muted/40 p-3 text-xs whitespace-pre-wrap">
                        {item.rule}
                      </pre>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => openEditConfig(item)}>
                        <Edit className="mr-2 h-3.5 w-3.5" />
                        Edit
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => deleteConfigMutation.mutate(item.id)}
                        disabled={deleteConfigMutation.isPending}
                      >
                        <Trash2 className="mr-2 h-3.5 w-3.5" />
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Scopes</CardTitle>
              <CardDescription>
                Scope groups such as frontend, backend, ai, infra, and docs.
              </CardDescription>
            </div>
            <Button variant="outline" onClick={openCreateScope}>
              <Plus className="mr-2 h-4 w-4" />
              New Scope
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {scopes.map((scope) => (
              <div key={scope.id} className="rounded-lg border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" style={{ borderColor: scope.hexColor, color: scope.hexColor }}>
                        {scope.title}
                      </Badge>
                      <Badge variant="secondary">{scope.infrastructure}</Badge>
                      {scope.tags.map((tag) => (
                        <TagBadge key={tag.id} tag={tag} />
                      ))}
                    </div>
                    <p className="text-sm text-muted-foreground">{scope.description}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEditScope(scope)}>
                      <Edit className="mr-2 h-3.5 w-3.5" />
                      Edit
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => deleteScopeMutation.mutate(scope.id)}
                      disabled={deleteScopeMutation.isPending}
                    >
                      <Trash2 className="mr-2 h-3.5 w-3.5" />
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Tags</CardTitle>
              <CardDescription>
                Active tags are attached to scopes and returned with every config payload.
              </CardDescription>
            </div>
            <Button variant="outline" onClick={openCreateTag}>
              <Plus className="mr-2 h-4 w-4" />
              New Tag
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {tags.map((tag) => (
              <div key={tag.id} className="rounded-lg border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <TagBadge tag={tag} />
                      {!tag.isActive && <Badge variant="secondary">Inactive</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground">{tag.description}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEditTag(tag)}>
                      <Edit className="mr-2 h-3.5 w-3.5" />
                      Edit
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => deleteTagMutation.mutate(tag.id)}
                      disabled={deleteTagMutation.isPending || !tag.isActive}
                    >
                      <Trash2 className="mr-2 h-3.5 w-3.5" />
                      Deactivate
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Dialog open={configDialogOpen} onOpenChange={setConfigDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingConfig ? "Edit Golden Path Config" : "Create Golden Path Config"}</DialogTitle>
            <DialogDescription>
              Define one rule row and attach it to an existing scope.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={configForm.title} onChange={(e) => setConfigForm((prev) => ({ ...prev, title: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input value={configForm.description} onChange={(e) => setConfigForm((prev) => ({ ...prev, description: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Scope</Label>
              <Select value={configForm.scopeId} onValueChange={(value) => setConfigForm((prev) => ({ ...prev, scopeId: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a scope" />
                </SelectTrigger>
                <SelectContent>
                  {scopes.map((scope) => (
                    <SelectItem key={scope.id} value={String(scope.id)}>
                      {scope.title} ({scope.infrastructure})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Rule</Label>
              <Textarea rows={6} value={configForm.rule} onChange={(e) => setConfigForm((prev) => ({ ...prev, rule: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfigDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => saveConfigMutation.mutate()} disabled={saveConfigMutation.isPending}>
              {saveConfigMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={scopeDialogOpen} onOpenChange={setScopeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingScope ? "Edit Scope" : "Create Scope"}</DialogTitle>
            <DialogDescription>
              Define a reusable scope and attach active tags to it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={scopeForm.title} onChange={(e) => setScopeForm((prev) => ({ ...prev, title: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea rows={3} value={scopeForm.description} onChange={(e) => setScopeForm((prev) => ({ ...prev, description: e.target.value }))} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Infrastructure</Label>
                <Input value={scopeForm.infrastructure} onChange={(e) => setScopeForm((prev) => ({ ...prev, infrastructure: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Hex Color</Label>
                <Input value={scopeForm.hexColor} onChange={(e) => setScopeForm((prev) => ({ ...prev, hexColor: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Active Tags</Label>
              <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-3">
                {tags.filter((tag) => tag.isActive).map((tag) => {
                  const checked = scopeForm.tagIds.includes(tag.id);
                  return (
                    <label key={tag.id} className="flex items-center gap-3 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setScopeForm((prev) => ({
                            ...prev,
                            tagIds: checked
                              ? prev.tagIds.filter((id) => id !== tag.id)
                              : [...prev.tagIds, tag.id],
                          }))
                        }
                      />
                      <span>{tag.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScopeDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => saveScopeMutation.mutate()} disabled={saveScopeMutation.isPending}>
              {saveScopeMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={tagDialogOpen} onOpenChange={setTagDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingTag ? "Edit Tag" : "Create Tag"}</DialogTitle>
            <DialogDescription>
              Manage tag definitions that can be attached to scopes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={tagForm.name} onChange={(e) => setTagForm((prev) => ({ ...prev, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea rows={3} value={tagForm.description} onChange={(e) => setTagForm((prev) => ({ ...prev, description: e.target.value }))} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Hex Color</Label>
                <Input value={tagForm.hexColor} onChange={(e) => setTagForm((prev) => ({ ...prev, hexColor: e.target.value }))} />
              </div>
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={tagForm.isActive}
                    onChange={(event) => setTagForm((prev) => ({ ...prev, isActive: event.target.checked }))}
                  />
                  Tag is active
                </label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTagDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => saveTagMutation.mutate()} disabled={saveTagMutation.isPending}>
              {saveTagMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
