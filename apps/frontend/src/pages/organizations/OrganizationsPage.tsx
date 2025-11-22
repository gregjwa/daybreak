import { useState } from "react";
import { useForm } from "react-hook-form";
import { Plus, Building2, Users } from "lucide-react";
import { Link } from "react-router-dom";
import {
  useOrganizations,
  useCreateOrganization,
  fetchOrganization,
} from "@/api/useOrganizations";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/ui/dialog";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/ui/card";
import { Skeleton } from "@/ui/skeleton";

export default function OrganizationsPage() {
  const { data: organizations, isLoading } = useOrganizations();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const queryClient = useQueryClient();

  const prefetchOrg = (id: string) => {
    queryClient.prefetchQuery({
      queryKey: ["organizations", id],
      queryFn: () => fetchOrganization(id),
    });
  };

  // Logic: Hide "Create Organization" if user is a member of any org but owns NONE.
  // (Assuming "invite-only" users shouldn't create new ones).
  // If they have 0 orgs, they see the empty state with Create.
  // If they have orgs, we check ownership.

  const hasOwnedOrgs = organizations?.some((org: any) => org.isOwner);
  const showCreateButton = !organizations?.length || hasOwnedOrgs;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Organizations</h1>
          <p className="text-muted-foreground">
            Manage your organizations and team memberships.
          </p>
        </div>
        {showCreateButton && (
          <CreateOrganizationDialog
            open={isCreateOpen}
            onOpenChange={setIsCreateOpen}
          />
        )}
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[120px] w-full rounded-xl" />
          ))}
        </div>
      ) : organizations?.length === 0 ? (
        <div className="flex min-h-[400px] flex-col items-center justify-center rounded-md border border-dashed p-8 text-center animate-in fade-in-50">
          <div className="mx-auto flex max-w-[420px] flex-col items-center justify-center text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted">
              <Building2 className="h-10 w-10 text-muted-foreground" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">No organizations yet</h3>
            <p className="mb-4 mt-2 text-sm text-muted-foreground">
              You haven't been invited to any organizations yet.
            </p>
            {/* Only show create if they are allowed (e.g. not restricted) - for now assuming empty state allows creation for everyone unless we have a global restriction flag. 
                But per user request "user ... is not supposed to be able to create organizations".
                If they have 0 orgs, they might be a new user who SHOULD be able to create?
                Or are they an "invite-only" user?
                Without a backend flag, we can't distinguish.
                Let's leave the Create button in the empty state for now, as a "fresh" user usually expects to create.
                The restriction mainly applies to preventing "Member" users from creating SIDE organizations?
                Actually, let's hide it if showCreateButton is false, but showCreateButton is true if length is 0.
                So new users CAN create.
                If user request means "This specific invited user shouldn't create", we'd need a backend "can_create_org" flag.
                I will respect the logic: if they are already a MEMBER (but not owner), hide create.
            */}
            {showCreateButton ? (
              <>
                <p className="mb-4 mt-2 text-sm text-muted-foreground">
                  You haven't created or joined any organizations yet. Create
                  one to get started.
                </p>
                <CreateOrganizationDialog
                  open={isCreateOpen}
                  onOpenChange={setIsCreateOpen}
                />
              </>
            ) : (
              <p className="mb-4 mt-2 text-sm text-muted-foreground">
                You are a member of organizations but do not have permission to
                create new ones.
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {/* Only show Create Organization card if the user has no organizations OR if we want it always visible as a card.
              But the requirement is: "the user (since it was from an invite link) is not supposed to be able to create organizations"
              Usually, logic is: Any user CAN create an org, but maybe we want to hide the big CTA if they already have one?
              Or maybe strictly limit creation? Let's keep creation available but add a logic check if needed.
              
              Wait, user said: "the user ... is not supposed to be able to create organizations, they should only be able to view their existing ones"
              
              This implies a permissions check. But currently any Clerk user is a "User".
              If we want to restrict creation, we need a flag on the user (e.g. is_admin?).
              Since we don't have a global admin flag, maybe we just hide the "Create" button if they are NOT an owner of any org?
              Or maybe we just hide it for everyone except via a specific path?
              
              For now, let's check if they own any org. If they are only a MEMBER of orgs, maybe they shouldn't see create?
              Let's implement: Only show "Create Organization" button if user is NOT a member of any org (first time) OR if they are an owner of at least one.
              Actually, simple logic: If they are a member of an org but NOT an owner, hide the create button?
              
              Let's filter:
              const canCreate = organizations.length === 0 || organizations.some(o => o.isOwner);
          */}
          {organizations?.map((org: any) => (
            <Link
              key={org.id}
              to={`/organizations/${org.id}`}
              className="block transition-transform hover:scale-[1.02]"
              onMouseEnter={() => prefetchOrg(org.id)}
            >
              <Card className="h-full cursor-pointer hover:border-primary/50 hover:bg-accent/5">
                <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                  <CardTitle className="text-xl font-semibold">
                    {org.name}
                  </CardTitle>
                  {org.isOwner && (
                    <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-primary text-primary-foreground hover:bg-primary/80">
                      Owner
                    </span>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-muted-foreground mt-2 flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    {org.memberCount} Member{org.memberCount !== 1 ? "s" : ""}
                  </div>
                  <CardDescription className="mt-4">
                    Role:{" "}
                    <span className="font-medium text-foreground">
                      {org.role}
                    </span>
                  </CardDescription>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateOrganizationDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { mutate: createOrg, isPending } = useCreateOrganization();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<{ name: string }>();

  const onSubmit = (data: { name: string }) => {
    createOrg(data.name, {
      onSuccess: () => {
        onOpenChange(false);
        reset();
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Create Organization
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create Organization</DialogTitle>
          <DialogDescription>
            Give your new organization a name. You can invite members later.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                Name
              </Label>
              <div className="col-span-3">
                <Input
                  id="name"
                  {...register("name", { required: "Name is required" })}
                  className="w-full"
                />
                {errors.name && (
                  <span className="text-xs text-destructive mt-1">
                    {errors.name.message}
                  </span>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Creating..." : "Create Organization"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
