import { useGetMe } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserCircle, Mail, Phone, Calendar } from "lucide-react";

export default function Profile() {
  const { data: user, isLoading } = useGetMe();

  if (isLoading) return <div className="p-8 text-center">Loading profile...</div>;
  if (!user) return <div className="p-8 text-center text-destructive">Failed to load profile.</div>;

  return (
    <div className="space-y-8 max-w-2xl mx-auto animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold font-serif">Profile</h1>
      </div>

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
              <p className="text-lg">{user.firstName}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Last Name</p>
              <p className="text-lg">{user.lastName}</p>
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
              <p>{user.phone || "Not provided"}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 py-3">
            <Calendar className="w-5 h-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium text-muted-foreground">Member Since</p>
              <p>{new Date(user.createdAt).toLocaleDateString()}</p>
            </div>
          </div>
          
          <div className="mt-4 inline-flex px-3 py-1 bg-secondary/10 text-secondary text-sm rounded-full font-medium capitalize">
            Role: {user.role}
          </div>
        </CardContent>
      </Card>
      
      <p className="text-sm text-center text-muted-foreground">
        To update your profile information, manage your account settings through Clerk.
      </p>
    </div>
  );
}