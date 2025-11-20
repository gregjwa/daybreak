import { useState } from "react";
import { useSetupBusiness } from "@/api/useProfile";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";
import { Card } from "@/ui/card";

interface BusinessSetupFormProps {
  onSuccess?: () => void;
}

const BusinessSetupForm = ({ onSuccess }: BusinessSetupFormProps) => {
  const [businessName, setBusinessName] = useState("");
  const { mutate: setupBusiness, isPending, error } = useSetupBusiness();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessName.trim()) return;

    setupBusiness(businessName, {
      onSuccess: () => {
        onSuccess?.();
      },
    });
  };

  return (
    <Card className="p-6 max-w-md mx-auto mt-8">
      <h2 className="text-2xl font-semibold mb-2">Set Up Your Business</h2>
      <p className="text-muted-foreground mb-6">
        Create a business profile to start inviting team members and managing
        bookings.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="businessName">Business Name</Label>
          <Input
            id="businessName"
            type="text"
            placeholder="e.g., Acme Recording Studio"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            required
            disabled={isPending}
          />
        </div>

        {error && (
          <div className="text-sm text-destructive">
            {error.message}
          </div>
        )}

        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? "Creating..." : "Create Business Profile"}
        </Button>
      </form>
    </Card>
  );
};

export default BusinessSetupForm;

