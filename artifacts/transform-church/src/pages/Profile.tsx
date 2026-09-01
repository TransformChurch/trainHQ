import { useGetMe } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserCircle, Mail, Phone, MapPin, Calendar, Hash, Pencil, Check, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";

const BASE = import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? import.meta.env.BASE_URL.replace(/\/$/, "");

export default function Profile() {
  const { data: user, isLoading } = useGetMe();
  const [tab, setTab] = useState<"view" | "edit">("view");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const openEdit = () => {
    setFirstName(user?.firstName ?? "");
    setLastName(user?.lastName ?? "");
    setPhone(user?.phone ?? "");
    setTab("edit");
  };

  const cancelEdit = () => setTab("view");

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`${BASE}/api/users/me`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(sessionStorage.getItem("auth_bearer_token") ? { Authorization: `Bearer ${sessionStorage.getItem("auth_bearer_token")}` } : {}),
        },
        body: JSON.stringify({ firstName, lastName, phone: phone || null }),
      });
      if (!res.ok) throw new Error("Failed to update profile");
      toast({ title: "Profile updated successfully" });
      await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      setTab("view");
    } catch {
      toast({ title: "Failed to update profile", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <div className="p-8 text-center">Loading profile...</div>;
  if (!user) return <div className="p-8 text-center text-destructive">Failed to load profile.</div>;

  const isPlanningCenterManaged = Boolean(user.planningCenterPersonId);
  const isProfileComplete = !!(user.firstName && user.lastName && user.email && user.phone);

  return (
    <div className="space-y-8 max-w-2xl mx-auto animate-in fade-in duration-500">
      {isPlanningCenterManaged && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary">
          Information can be updated via Church Center app
        </div>
      )}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold font-serif">Profile</h1>
        {tab === "view" && !isPlanningCenterManaged && (
          <Button variant="outline" size="sm" onClick={openEdit}>
            <Pencil className="w-4 h-4 mr-2" /> Edit Profile
          </Button>
        )}
      </div>

      {!isProfileComplete && tab === "view" && !isPlanningCenterManaged && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
          <div className="mt-0.5 text-amber-500">⚠️</div>
          <div>
            <p className="font-medium text-amber-800">Profile Incomplete</p>
            <p className="text-sm text-amber-700 mt-0.5">
              {!user.phone && "Your phone number is missing. "}
              {!user.firstName && "First name is missing. "}
              {!user.lastName && "Last name is missing. "}
              Add your details to complete your profile.
            </p>
            <Button size="sm" variant="outline" className="mt-3 border-amber-300 text-amber-800 hover:bg-amber-100" onClick={openEdit}>
              Complete Profile
            </Button>
          </div>
        </div>
      )}

      {tab === "view" || isPlanningCenterManaged ? (
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-xl flex items-center gap-2">
              <UserCircle className="w-6 h-6 text-primary" /> Personal Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">First Name</p>
                <p className="text-lg">{user.firstName || <span className="text-muted-foreground italic">Not set</span>}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Last Name</p>
                <p className="text-lg">{user.lastName || <span className="text-muted-foreground italic">Not set</span>}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 py-3 border-y border-border">
              <Mail className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">Email Address</p>
                <p>{user.email}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 py-3 border-b border-border">
              <Phone className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">Phone Number</p>
                <p>{user.phone || <span className="text-muted-foreground italic">Not provided</span>}</p>
              </div>
            </div>

            <div className="flex items-start gap-3 py-3 border-b border-border">
              <MapPin className="w-5 h-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">Address</p>
                <p>{user.address || <span className="text-muted-foreground italic">Not provided</span>}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 py-3 border-b border-border">
              <Hash className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">Planning Center ID</p>
                <p>{user.planningCenterPersonId || <span className="text-muted-foreground italic">Not connected</span>}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 py-3">
              <Calendar className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">Member Since</p>
                <p>{new Date(user.createdAt).toLocaleDateString()}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Badge variant="secondary" className="capitalize">
                Role: {user.role}
              </Badge>
              {isProfileComplete && (
                <Badge variant="outline" className="text-green-700 border-green-200 bg-green-50">
                  <Check className="w-3 h-3 mr-1" /> Profile Complete
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-xl flex items-center gap-2">
              <Pencil className="w-5 h-5 text-primary" /> Edit Profile
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    value={firstName}
                    onChange={e => setFirstName(e.target.value)}
                    required
                    placeholder="John"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    required
                    placeholder="Smith"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  value={user.email}
                  disabled
                  className="opacity-60"
                />
                <p className="text-xs text-muted-foreground">Email is managed through your sign-in account.</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="+1 (555) 000-0000"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <Button type="submit" disabled={saving} className="flex-1">
                  {saving ? "Saving..." : "Save Changes"}
                </Button>
                <Button type="button" variant="outline" onClick={cancelEdit} disabled={saving}>
                  <X className="w-4 h-4 mr-2" /> Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
