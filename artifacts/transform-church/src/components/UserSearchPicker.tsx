import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";

export type PickerUser = {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  role?: string | null;
};

const MAX_RESULTS = 50;

function fullName(user: PickerUser) {
  return `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email || "Unnamed";
}

// Every word typed must appear somewhere in the person's name or email, so
// "al gon" finds Albert Gonzalez.
function matches(user: PickerUser, query: string) {
  const haystack = `${user.firstName ?? ""} ${user.lastName ?? ""} ${user.email ?? ""}`.toLowerCase();
  return query.toLowerCase().split(/\s+/).filter(Boolean).every((word) => haystack.includes(word));
}

/**
 * Type-to-search replacement for long "select a user" dropdowns. Shows the
 * picked person as a chip; typing filters by first name, last name or email.
 */
export function UserSearchPicker({
  users,
  value,
  onChange,
  placeholder = "Search by name or email...",
  emptyText = "No one matches that search.",
  showRole = false,
}: {
  users: PickerUser[];
  value: string;
  onChange: (userId: string) => void;
  placeholder?: string;
  emptyText?: string;
  showRole?: boolean;
}) {
  const [query, setQuery] = useState("");
  const selected = users.find((user) => user.id === value);

  const sorted = useMemo(
    () => [...users].sort((a, b) => fullName(a).localeCompare(fullName(b))),
    [users],
  );
  const results = useMemo(
    () => (query.trim() ? sorted.filter((user) => matches(user, query)) : sorted),
    [sorted, query],
  );

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border border-input bg-muted/30 px-3 py-1.5 text-sm">
        <div className="min-w-0">
          <p className="font-medium truncate">{fullName(selected)}</p>
          {selected.email && <p className="text-xs text-muted-foreground truncate">{selected.email}</p>}
        </div>
        <button
          type="button"
          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={() => { onChange(""); setQuery(""); }}
          title="Choose someone else"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              if (results.length === 1) onChange(results[0].id);
            }
          }}
          placeholder={placeholder}
          className="pl-8"
          autoComplete="off"
        />
      </div>
      <div className="max-h-52 overflow-y-auto rounded-md border border-input divide-y divide-border">
        {users.length === 0 ? (
          <p className="px-3 py-2 text-sm text-muted-foreground">No one to choose from.</p>
        ) : results.length === 0 ? (
          <p className="px-3 py-2 text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          results.slice(0, MAX_RESULTS).map((user) => (
            <button
              key={user.id}
              type="button"
              onClick={() => onChange(user.id)}
              className="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-sm hover:bg-muted/60 focus:bg-muted/60 focus:outline-none"
            >
              <span className="min-w-0">
                <span className="block font-medium truncate">{fullName(user)}</span>
                {user.email && <span className="block text-xs text-muted-foreground truncate">{user.email}</span>}
              </span>
              {showRole && user.role && <span className="shrink-0 text-xs text-muted-foreground capitalize">{user.role}</span>}
            </button>
          ))
        )}
      </div>
      {results.length > MAX_RESULTS && (
        <p className="text-xs text-muted-foreground">
          Showing {MAX_RESULTS} of {results.length}. Keep typing to narrow it down.
        </p>
      )}
    </div>
  );
}
