"use client";

import {
  DotsThreeIcon,
  DownloadSimpleIcon,
  FileIcon,
  FileTextIcon,
  FolderSimpleIcon,
  LinkSimpleIcon,
  PencilSimpleIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  TOP_LEVEL_HINTS,
  formatBytes,
  formatModified,
  isFolderLike,
  typeLabel,
} from "@/components/file-manager-format";
import { DOWNLOAD_LIMIT } from "@/server/files-paths";
import type { FileEntry } from "@/server/files";
import { cn } from "@/lib/utils";

type Props = {
  entries: FileEntry[];
  /** Folder being shown, "" for the project folder. */
  dir: string;
  /** Files and folders inside this folder can be renamed and deleted. */
  modifiable: boolean;
  selectedName: string | null;
  activeName: string | null;
  label: string;
  busy: boolean;
  downloadHref: (entry: FileEntry) => string;
  onActivate: (name: string) => void;
  onOpen: (entry: FileEntry) => void;
  onRename: (entry: FileEntry) => void;
  onDelete: (entry: FileEntry) => void;
  onUp: () => void;
};

function EntryIcon({ entry }: { entry: FileEntry }) {
  const Icon = isFolderLike(entry)
    ? FolderSimpleIcon
    : entry.type === "link"
      ? LinkSimpleIcon
      : /\.(txt|md|json|ya?ml|toml|env|log|js|ts|tsx|jsx|css|html|py|sh|conf|ini|csv)$/i.test(entry.name)
        ? FileTextIcon
        : FileIcon;
  return (
    <Icon
      aria-hidden="true"
      weight={isFolderLike(entry) ? "fill" : "regular"}
      className={cn("size-5 shrink-0", isFolderLike(entry) ? "text-[var(--ds-gray-700)]" : "text-muted-foreground")}
    />
  );
}

/**
 * The folder's contents as a grid with one tab stop. Arrow keys move between
 * rows, Enter opens a folder or selects a file, Delete asks to delete, F2
 * renames, Alt+Up goes to the parent folder.
 */
export function FileTable({
  entries,
  dir,
  modifiable,
  selectedName,
  activeName,
  label,
  busy,
  downloadHref,
  onActivate,
  onOpen,
  onRename,
  onDelete,
  onUp,
}: Props) {
  const active = Math.max(0, entries.findIndex((e) => e.name === activeName));
  const nameAt = (i: number) => entries[Math.min(Math.max(i, 0), entries.length - 1)]?.name;

  function focusRow(index: number) {
    const name = nameAt(index);
    if (name === undefined) return;
    onActivate(name);
    // The row exists already; focusing it directly keeps the move instant.
    document.querySelector<HTMLElement>(`[data-fm-row="${CSS.escape(name)}"]`)?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTableRowElement>, entry: FileEntry, index: number) {
    // Keys pressed inside a menu or button in the row are theirs.
    if (e.target !== e.currentTarget) return;
    if (e.altKey && e.key === "ArrowUp") {
      e.preventDefault();
      onUp();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        focusRow(index + 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        focusRow(index - 1);
        break;
      case "Home":
        e.preventDefault();
        focusRow(0);
        break;
      case "End":
        e.preventDefault();
        focusRow(entries.length - 1);
        break;
      case "PageDown":
        e.preventDefault();
        focusRow(index + 10);
        break;
      case "PageUp":
        e.preventDefault();
        focusRow(index - 10);
        break;
      case "Enter":
        e.preventDefault();
        onOpen(entry);
        break;
      case "Delete":
        e.preventDefault();
        onDelete(entry);
        break;
      case "F2":
        e.preventDefault();
        onRename(entry);
        break;
    }
  }

  return (
    <table
      role="grid"
      aria-label={label}
      aria-busy={busy || undefined}
      aria-rowcount={entries.length + 1}
      className={cn("w-full table-fixed border-collapse text-left", busy && "opacity-70")}
    >
      <thead className="border-b text-label text-muted-foreground">
        <tr role="row">
          <th scope="col" role="columnheader" className="px-4 py-2 font-medium">
            Name
          </th>
          <th scope="col" role="columnheader" className="hidden w-24 px-3 py-2 text-right font-medium sm:table-cell">
            Size
          </th>
          <th scope="col" role="columnheader" className="hidden w-36 px-3 py-2 font-medium md:table-cell">
            Modified
          </th>
          <th scope="col" role="columnheader" className="hidden w-36 px-3 py-2 font-medium 2xl:table-cell">
            Type
          </th>
          <th scope="col" role="columnheader" className="w-12 px-2 py-2 max-sm:w-14">
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody className="hairline-y">
        {entries.map((entry, index) => {
          const folder = isFolderLike(entry);
          const selected = entry.name === selectedName;
          const hint = dir === "" ? TOP_LEVEL_HINTS[entry.name] : undefined;
          const canModify = modifiable;
          const canDownload = entry.type === "file" || entry.linkTo === "file";
          const tooBig = entry.size > DOWNLOAD_LIMIT;
          const hasMenu = canModify || canDownload;
          const facts = [
            folder || entry.type !== "file" ? null : formatBytes(entry.size),
            formatModified(entry.modified),
            typeLabel(entry),
          ].filter(Boolean);
          return (
            <tr
              key={entry.name}
              role="row"
              data-fm-row={entry.name}
              tabIndex={index === active ? 0 : -1}
              aria-selected={selected}
              aria-rowindex={index + 2}
              onFocus={(e) => {
                if (e.target === e.currentTarget) onActivate(entry.name);
              }}
              onClick={() => {
                onActivate(entry.name);
                onOpen(entry);
              }}
              onKeyDown={(e) => onKeyDown(e, entry, index)}
              className={cn(
                "group/row cursor-pointer transition-colors duration-(--dur-fast) outline-none hover:bg-[var(--ds-gray-alpha-100)] focus-visible:bg-[var(--ds-gray-alpha-100)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--ds-focus-color)]",
                selected && "bg-[var(--ds-gray-alpha-200)] hover:bg-[var(--ds-gray-alpha-200)]"
              )}
            >
              <td role="gridcell" className="px-4 py-2 max-sm:py-2.5">
                <div className="flex items-center gap-3">
                  <EntryIcon entry={entry} />
                  <div className="min-w-0">
                    <span className="block truncate font-medium tracking-[-0.01em]">
                      {entry.name}
                      <span className="sr-only">
                        , {typeLabel(entry).toLowerCase()}
                        {selected ? ", selected" : ""}
                      </span>
                    </span>
                    {entry.type === "link" && entry.target ? (
                      <span className="block truncate text-caption text-muted-foreground">
                        Points to {entry.target}
                      </span>
                    ) : hint ? (
                      <span className="block text-caption text-muted-foreground">{hint}</span>
                    ) : (
                      <span className="block truncate text-caption text-muted-foreground sm:hidden">
                        {facts.join(", ")}
                      </span>
                    )}
                  </div>
                </div>
              </td>
              <td role="gridcell" className="tabular hidden px-3 py-2 text-right text-[13px] text-muted-foreground sm:table-cell">
                {folder || entry.type !== "file" ? "-" : formatBytes(entry.size)}
              </td>
              <td role="gridcell" className="hidden truncate px-3 py-2 text-[13px] text-muted-foreground md:table-cell">
                {entry.modified ? (
                  <time dateTime={entry.modified}>{formatModified(entry.modified)}</time>
                ) : (
                  "-"
                )}
              </td>
              <td role="gridcell" className="hidden truncate px-3 py-2 text-[13px] text-muted-foreground 2xl:table-cell">
                {typeLabel(entry)}
              </td>
              <td
                role="gridcell"
                className="px-2 py-1 text-right"
                // Clicks and keys inside the menu (it renders in a portal, but
                // React still bubbles them here) must not open the row.
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                {hasMenu ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Actions for ${entry.name}`}
                          tabIndex={index === active ? 0 : -1}
                        />
                      }
                    >
                      <DotsThreeIcon weight="bold" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      {canDownload && !tooBig ? (
                        <DropdownMenuItem render={<a href={downloadHref(entry)} download={entry.name} />}>
                          <DownloadSimpleIcon /> Download
                        </DropdownMenuItem>
                      ) : null}
                      {canDownload && tooBig ? (
                        <DropdownMenuItem disabled>
                          <DownloadSimpleIcon /> Over 50 MB
                        </DropdownMenuItem>
                      ) : null}
                      {canModify ? (
                        <>
                          {canDownload ? <DropdownMenuSeparator /> : null}
                          <DropdownMenuItem onClick={() => onRename(entry)}>
                            <PencilSimpleIcon /> Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem variant="destructive" onClick={() => onDelete(entry)}>
                            <TrashIcon /> Delete
                          </DropdownMenuItem>
                        </>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
