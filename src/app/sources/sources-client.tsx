"use client";

import { FileUp, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";
import {
  type AddSourceResult,
  addSource,
  type ImportSourcesFromOpmlResult,
  importSourcesFromOpml,
  removeSource,
  toggleSourceStatus,
} from "@/app/actions/source-actions";
import type { SourceListItem } from "@/app/sources/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type OptimisticSourceAction =
  | { type: "remove"; id: string }
  | { type: "toggle"; id: string; status: SourceListItem["status"] };

type CompletedOpmlImportResult = Extract<ImportSourcesFromOpmlResult, { status: "completed" }>;

type AddSourceFeedback = {
  message: string;
  shouldClearInput: boolean;
  shouldRefresh: boolean;
  tone: "success" | "error";
};

type OpmlImportFeedback = {
  message: string;
  shouldClearFile: boolean;
  shouldRefresh: boolean;
  tone: "success" | "error";
};

export function getNextOpmlImportResult(result: ImportSourcesFromOpmlResult): CompletedOpmlImportResult | null {
  return result.status === "completed" ? result : null;
}

export function getAddSourceFeedback(result: AddSourceResult): AddSourceFeedback {
  switch (result.status) {
    case "created":
      return {
        tone: "success",
        message: result.message || "Source added.",
        shouldClearInput: true,
        shouldRefresh: true,
      };
    case "skipped_duplicate":
      return {
        tone: "success",
        message: result.message || "Source already exists.",
        shouldClearInput: true,
        shouldRefresh: true,
      };
    case "failed":
      return {
        tone: "error",
        message: result.message || "Failed to add source.",
        shouldClearInput: false,
        shouldRefresh: false,
      };
    default:
      return {
        tone: "error",
        message: "Failed to add source.",
        shouldClearInput: false,
        shouldRefresh: false,
      };
  }
}

export function getOpmlImportFeedback(result: ImportSourcesFromOpmlResult): OpmlImportFeedback {
  if (result.status === "failed") {
    return {
      tone: "error",
      message: result.message || "OPML 导入失败。",
      shouldClearFile: false,
      shouldRefresh: false,
    };
  }

  if (result.totalCount === 0) {
    return {
      tone: "success",
      message: "OPML 导入完成，但未发现可导入的订阅源。",
      shouldClearFile: true,
      shouldRefresh: true,
    };
  }

  const parts = [`新增 ${result.createdCount}`, `已存在 ${result.skippedCount}`];

  if (result.failedCount > 0) {
    parts.push(`失败 ${result.failedCount}`);
  }

  return {
    tone: "success",
    message: `OPML 导入完成，共 ${result.totalCount} 条：${parts.join("，")}。`,
    shouldClearFile: true,
    shouldRefresh: true,
  };
}

export function SourcesClient({ initialSources }: { initialSources: SourceListItem[] }) {
  const router = useRouter();
  const [newSourceUrl, setNewSourceUrl] = useState("");
  const [selectedOpmlFile, setSelectedOpmlFile] = useState<File | null>(null);
  const [opmlImportResult, setOpmlImportResult] = useState<CompletedOpmlImportResult | null>(null);
  const [isOpmlDragActive, setIsOpmlDragActive] = useState(false);
  const opmlFileInputRef = useRef<HTMLInputElement | null>(null);
  const [isSourceMutationPending, startSourceMutationTransition] = useTransition();
  const [isOpmlImportPending, startOpmlImportTransition] = useTransition();

  const [optimisticSources, setOptimisticSources] = useOptimistic(
    initialSources,
    (state, action: OptimisticSourceAction) => {
      switch (action.type) {
        case "remove":
          return state.filter((source) => source.id !== action.id);
        case "toggle":
          return state.map((source) =>
            source.id === action.id ? { ...source, status: getNextStatus(action.status) } : source,
          );
        default:
          return state;
      }
    },
  );

  const handleAddSource = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newSourceUrl.trim()) return;

    const url = newSourceUrl.trim();

    startSourceMutationTransition(async () => {
      try {
        const result = await addSource(url);
        const feedback = getAddSourceFeedback(result);

        if (feedback.shouldClearInput) {
          setNewSourceUrl("");
        }

        if (feedback.shouldRefresh) {
          router.refresh();
        }

        if (feedback.tone === "success") {
          toast.success(feedback.message);
          return;
        }

        toast.error(feedback.message);
      } catch (error) {
        console.error("Failed to add source", error);
        setNewSourceUrl(url);
        toast.error("Failed to add source.");
      }
    });
  };

  const handleToggleSource = (id: string, currentStatus: "active" | "paused" | "blocked") => {
    startSourceMutationTransition(async () => {
      try {
        setOptimisticSources({ type: "toggle", id, status: currentStatus });
        await toggleSourceStatus(id, currentStatus);
        router.refresh();
      } catch (error) {
        console.error("Failed to update source status", error);
        router.refresh();
        toast.error("Failed to update source status.");
      }
    });
  };

  const handleRemoveSource = (id: string) => {
    startSourceMutationTransition(async () => {
      try {
        setOptimisticSources({ type: "remove", id });
        const result = await removeSource(id);
        if (!result.success) {
          router.refresh();
          toast.error(result.error);
          return;
        }
        router.refresh();
      } catch (error) {
        console.error("Failed to remove source", error);
        router.refresh();
        toast.error("Failed to delete source.");
      }
    });
  };

  const openOpmlFilePicker = () => {
    opmlFileInputRef.current?.click();
  };

  const clearSelectedOpmlFile = () => {
    setSelectedOpmlFile(null);

    if (opmlFileInputRef.current) {
      opmlFileInputRef.current.value = "";
    }
  };

  const setOpmlFile = (file: File | null) => {
    setSelectedOpmlFile(file);
  };

  const handleOpmlFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    setOpmlFile(input.files?.[0] ?? null);
  };

  const handleOpmlDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setIsOpmlDragActive(false);
    setOpmlFile(event.dataTransfer.files?.[0] ?? null);
  };

  const handleImportOpml = async () => {
    if (!selectedOpmlFile) {
      toast.error("请选择 OPML 文件。");
      return;
    }

    let opmlContent: string;

    try {
      opmlContent = await selectedOpmlFile.text();
    } catch (error) {
      console.error("Failed to read OPML file", error);
      toast.error("读取 OPML 文件失败。");
      return;
    }

    if (!opmlContent.trim()) {
      toast.error("OPML 文件内容为空。");
      return;
    }

    startOpmlImportTransition(async () => {
      try {
        const result = await importSourcesFromOpml(opmlContent);
        const feedback = getOpmlImportFeedback(result);
        setOpmlImportResult(getNextOpmlImportResult(result));

        if (feedback.shouldClearFile) {
          clearSelectedOpmlFile();
        }

        if (feedback.shouldRefresh) {
          router.refresh();
        }

        if (feedback.tone === "success") {
          toast.success(feedback.message);
          return;
        }

        toast.error(feedback.message);
      } catch (error) {
        console.error("Failed to import OPML", error);
        toast.error("OPML 导入失败。");
      }
    });
  };

  const importSummaryCards = opmlImportResult
    ? [
        { label: "总计", value: opmlImportResult.totalCount },
        { label: "已新增", value: opmlImportResult.createdCount },
        { label: "已存在", value: opmlImportResult.skippedCount },
        { label: "失败", value: opmlImportResult.failedCount },
      ]
    : [];

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-2">
      <Card className="border-border">
        <CardHeader>
          <CardTitle>Manage Sources</CardTitle>
          <CardDescription>添加单个 RSS，或通过 OPML 批量导入现有订阅清单。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Tabs defaultValue="single" className="gap-4">
            <TabsList>
              <TabsTrigger value="single">单条 RSS</TabsTrigger>
              <TabsTrigger value="opml">OPML 导入</TabsTrigger>
            </TabsList>

            <TabsContent value="single" className="pt-1">
              <form onSubmit={handleAddSource} className="flex flex-col gap-4 sm:flex-row">
                <Input
                  placeholder="RSS Feed URL"
                  value={newSourceUrl}
                  type="url"
                  onChange={(event) => setNewSourceUrl(event.target.value)}
                  className="flex-1"
                  required
                />
                <Button type="submit" disabled={isSourceMutationPending}>
                  {isSourceMutationPending ? "Adding..." : "Add Source"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="opml" className="space-y-4 pt-1">
              <input
                ref={opmlFileInputRef}
                type="file"
                accept=".opml,.xml,text/xml,application/xml"
                className="hidden"
                onChange={handleOpmlFileChange}
              />

              <button
                type="button"
                onClick={openOpmlFilePicker}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setIsOpmlDragActive(true);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsOpmlDragActive(true);
                }}
                onDragLeave={(event) => {
                  event.preventDefault();
                  setIsOpmlDragActive(false);
                }}
                onDrop={handleOpmlDrop}
                className={
                  isOpmlDragActive
                    ? "flex cursor-pointer flex-col items-center justify-center rounded-xl border border-primary/50 bg-primary/5 px-6 py-10 text-center transition"
                    : "flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/10 px-6 py-10 text-center transition hover:border-primary/40 hover:bg-primary/5"
                }
              >
                <div className="mb-4 flex size-11 items-center justify-center rounded-full bg-muted text-foreground">
                  <FileUp size={18} />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium">
                    {selectedOpmlFile ? selectedOpmlFile.name : "拖拽 OPML 文件到这里，或点击选择文件"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {selectedOpmlFile
                      ? "文件已就绪，可以直接导入，或重新选择其他文件。"
                      : "支持 .opml 与 .xml 文件，导入后会显示本次结果摘要。"}
                  </p>
                </div>
              </button>

              <div className="flex flex-wrap gap-3">
                <Button type="button" variant="outline" onClick={openOpmlFilePicker} disabled={isOpmlImportPending}>
                  {selectedOpmlFile ? "更换文件" : "选择文件"}
                </Button>
                {selectedOpmlFile ? (
                  <Button type="button" variant="ghost" onClick={clearSelectedOpmlFile} disabled={isOpmlImportPending}>
                    <X size={14} />
                    清空
                  </Button>
                ) : null}
                <Button type="button" onClick={handleImportOpml} disabled={isOpmlImportPending || !selectedOpmlFile}>
                  {isOpmlImportPending ? "导入中..." : "开始导入"}
                </Button>
              </div>
            </TabsContent>
          </Tabs>

          {opmlImportResult ? (
            <div className="space-y-4 rounded-xl border border-border bg-muted/10 p-4">
              <div className="space-y-1">
                <div className="text-sm font-medium">本次导入结果</div>
                <div className="text-xs text-muted-foreground">导入运行 ID：{opmlImportResult.importRunId}</div>
              </div>

              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {importSummaryCards.map((item) => (
                  <div key={item.label} className="rounded-lg border border-border bg-background/80 p-3">
                    <div className="text-xs text-muted-foreground">{item.label}</div>
                    <div className="mt-1 text-lg font-semibold">{item.value}</div>
                  </div>
                ))}
              </div>

              {opmlImportResult.failedItems.length > 0 ? (
                <div className="space-y-2">
                  <div className="text-sm font-medium">失败明细</div>
                  <div className="space-y-2">
                    {opmlImportResult.failedItems.map((item) => (
                      <div
                        key={`${opmlImportResult.importRunId}:${item.inputUrl}:${item.errorMessage}`}
                        className="rounded-lg border border-border bg-background/80 p-3"
                      >
                        <div className="truncate text-xs font-medium">{item.inputUrl}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{item.errorMessage}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {optimisticSources.map((source) => (
          <Card
            key={source.id}
            className={
              source.status === "active"
                ? "group transition-all border-border hover:border-primary/50"
                : "group transition-all border-border opacity-75"
            }
          >
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <Badge
                  variant={source.status === "active" ? "default" : "secondary"}
                  className={source.status === "active" ? "bg-primary text-primary-foreground" : ""}
                >
                  {source.status}
                </Badge>
                <AlertDialog>
                  <AlertDialogTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        disabled={isSourceMutationPending}
                      >
                        <Trash2 size={16} />
                      </Button>
                    }
                  />
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>确定要删除该来源吗？</AlertDialogTitle>
                      <AlertDialogDescription>此操作无法撤销。这将永久删除该数据源。</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>取消</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => handleRemoveSource(source.id)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        删除
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
              <CardTitle className="text-lg mt-2 truncate">{source.title}</CardTitle>
              <CardDescription className="truncate text-xs">{source.identifier}</CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <Button
                type="button"
                variant="link"
                className="p-0 h-auto text-xs text-primary font-semibold hover:underline"
                onClick={() => handleToggleSource(source.id, source.status)}
                disabled={isSourceMutationPending}
              >
                {source.status === "active" ? "Pause Sync" : "Resume Sync"}
              </Button>
            </CardContent>
          </Card>
        ))}

        {optimisticSources.length === 0 && (
          <div className="col-span-full text-center py-12 text-muted-foreground bg-muted/10 rounded-xl border border-dashed border-border">
            No sources configured. Try adding an RSS feed above!
          </div>
        )}
      </div>
    </div>
  );
}

function getNextStatus(status: SourceListItem["status"]) {
  return status === "active" ? "paused" : "active";
}
