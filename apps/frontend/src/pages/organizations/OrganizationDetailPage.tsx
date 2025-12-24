import { useState } from "react";
import { useForm } from "react-hook-form";
import {
  useParams,
  Link,
  useSearchParams,
  useNavigate,
} from "react-router-dom";
import { useOrganization, useDeleteOrganization } from "@/api/useOrganizations";
import { useRoles, useCreateRole } from "@/api/useRoles";
import { useCreateInvite } from "@/api/useInvites";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/ui/table";
import { Badge } from "@/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/ui/avatar";
import { Skeleton } from "@/ui/skeleton";
import {
  Plus,
  ArrowLeft,
  Copy,
} from "@phosphor-icons/react";
import { DotsThreeVertical, EnvelopeSimple, Trash } from "@phosphor-icons/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/ui/dialog";
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
} from "@/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/ui/select";
import { toast } from "sonner";

export default function OrganizationDetailPage() {
  const { id } = useParams<{ id: string }>();

  // URL-based tab state
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get("tab") || "members";

  // Determine if we should poll: only if we are on the 'invites' tab AND there are pending invites
  // We need to access the current data to check for pending invites.
  const { data: org, isLoading } = useOrganization(id!, {
    refetchInterval: (query) => {
      if (currentTab !== "invites") return false;
      const data = query.state.data;
      // Check if there are any pending invites
      const hasPending = data?.invites?.some(
        (invite: any) => invite.status === "PENDING"
      );
      return hasPending ? 5000 : false;
    },
  });

  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!org) {
    return <div>Organization not found</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/organizations">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{org.name}</h1>
            <p className="text-muted-foreground">
              {org.isOwner ? "You are the Owner" : "Member View"}
            </p>
          </div>
        </div>
        {org.isOwner && <OrganizationActions orgId={org.id} />}
      </div>

      <Tabs
        value={currentTab}
        onValueChange={handleTabChange}
        className="space-y-4"
      >
        <TabsList>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
          <TabsTrigger value="invites">Invites</TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="space-y-4">
          <MembersTab org={org} />
        </TabsContent>

        <TabsContent value="roles" className="space-y-4">
          <RolesTab orgId={org.id} isOwner={org.isOwner} />
        </TabsContent>

        <TabsContent value="invites" className="space-y-4">
          <InvitesTab
            orgId={org.id}
            isOwner={org.isOwner}
            invites={org.invites}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function OrganizationActions({ orgId }: { orgId: string }) {
  const { mutate: deleteOrg, isPending } = useDeleteOrganization();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);

  const handleDelete = () => {
    deleteOrg(orgId, {
      onSuccess: () => {
        toast.success("Organization deleted");
        navigate("/organizations");
      },
      onError: () => {
        toast.error("Failed to delete organization");
      },
    });
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon">
            <DotsThreeVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <AlertDialogTrigger asChild>
            <DropdownMenuItem className="text-destructive focus:text-destructive">
              <Trash className="mr-2 h-4 w-4" />
              Delete Organization
            </DropdownMenuItem>
          </AlertDialogTrigger>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently delete the
            organization and remove all data associated with it.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isPending ? "Deleting..." : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function MembersTab({ org }: { org: any }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Members</CardTitle>
        <CardDescription>
          Manage members and their roles in {org.name}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="hidden md:table-cell">Joined</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {org.members?.map((member: any) => (
              <TableRow key={member.id}>
                <TableCell className="flex items-center gap-3">
                  <Avatar>
                    <AvatarImage src={member.user?.imageUrl} />
                    <AvatarFallback>
                      {member.clerkUserId.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col">
                    <span className="font-medium">
                      {member.user?.firstName && member.user?.lastName
                        ? `${member.user.firstName} ${member.user.lastName}`
                        : member.user?.email ||
                          `User ${member.clerkUserId.slice(-4)}`}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {member.clerkUserId === org.ownerId ? "Owner" : "Member"}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  {member.role?.name ? (
                    <Badge variant="secondary">{member.role.name}</Badge>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {new Date(member.createdAt).toLocaleDateString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function RolesTab({ orgId, isOwner }: { orgId: string; isOwner: boolean }) {
  const { data: roles, isLoading } = useRoles(orgId);
  const { mutate: createRole, isPending } = useCreateRole(orgId);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const { register, handleSubmit, reset } = useForm<{ name: string }>();

  const onSubmit = (data: { name: string }) => {
    createRole(data.name, {
      onSuccess: () => {
        setIsCreateOpen(false);
        reset();
        toast.success("Role created successfully");
      },
    });
  };

  if (!isOwner) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Roles</CardTitle>
          <CardDescription>
            View available roles in this organization.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">
            Only the owner can manage roles.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Roles</CardTitle>
          <CardDescription>
            Define custom roles (e.g. "Sound Engineer", "Security") for
            invitees.
          </CardDescription>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Add Role
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Role</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="role-name">Role Name</Label>
                <Input
                  id="role-name"
                  placeholder="e.g. Sound Engineer"
                  {...register("name", { required: true })}
                />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={isPending}>
                  Create
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-20" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roles?.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={2}
                    className="text-center text-muted-foreground"
                  >
                    No roles defined yet.
                  </TableCell>
                </TableRow>
              )}
              {roles?.map((role: any) => (
                <TableRow key={role.id}>
                  <TableCell className="font-medium">{role.name}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" disabled>
                      <Trash className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function InvitesTab({
  orgId,
  isOwner,
  invites,
}: {
  orgId: string;
  isOwner: boolean;
  invites: any[];
}) {
  const { data: roles } = useRoles(orgId);
  const { mutate: createInvite, isPending } = useCreateInvite(orgId);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<string>("");
  const { register, handleSubmit, reset } = useForm<{ email: string }>();
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  const getRoleName = (roleId: string | null) => {
    if (!roleId) return null;
    return roles?.find((r: any) => r.id === roleId)?.name;
  };

  const onSubmit = (data: { email: string }) => {
    createInvite(
      { email: data.email, roleId: selectedRole || undefined },
      {
        onSuccess: (res: any) => {
          setInviteLink(res.inviteLink);
          reset();
          toast.success("Invite created!");
        },
      }
    );
  };

  const copyLink = () => {
    if (inviteLink) {
      navigator.clipboard.writeText(inviteLink);
      toast.success("Link copied to clipboard");
    }
  };

  if (!isOwner) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Invites</CardTitle>
          <CardDescription>Only the owner can manage invites.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Invites</CardTitle>
          <CardDescription>
            Create invite links for new members.
          </CardDescription>
        </div>
        <Dialog
          open={isCreateOpen}
          onOpenChange={(open) => {
            setIsCreateOpen(open);
            if (!open) setInviteLink(null);
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm">
              <EnvelopeSimple className="mr-2 h-4 w-4" />
              Create Invite
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Invite</DialogTitle>
              <DialogDescription>
                Generate a unique link for a user to join.
              </DialogDescription>
            </DialogHeader>

            {!inviteLink ? (
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="colleague@example.com"
                    {...register("email", { required: true })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Role (Optional)</Label>
                  <Select value={selectedRole} onValueChange={setSelectedRole}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a role" />
                    </SelectTrigger>
                    <SelectContent>
                      {roles?.map((r: any) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={isPending}>
                    Generate Link
                  </Button>
                </DialogFooter>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="p-4 bg-muted rounded-md break-all text-sm font-mono border">
                  {inviteLink}
                </div>
                <Button onClick={copyLink} className="w-full">
                  <Copy className="mr-2 h-4 w-4" />
                  Copy Link
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden md:table-cell">Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invites?.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-center text-muted-foreground"
                >
                  No pending invites.
                </TableCell>
              </TableRow>
            )}
            {invites?.map((invite: any) => (
              <TableRow key={invite.id}>
                <TableCell>{invite.email}</TableCell>
                <TableCell>
                  {invite.roleId ? (
                    <Badge variant="outline">
                      {getRoleName(invite.roleId) || "Unknown Role"}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      invite.status === "ACCEPTED" ? "default" : "secondary"
                    }
                  >
                    {invite.status}
                  </Badge>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {new Date(invite.createdAt).toLocaleDateString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
