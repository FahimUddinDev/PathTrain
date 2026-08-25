import { Button } from "@/components/ui/button";

export function LogoutButton() {
  return (
    <form action="/api/auth/logout" method="post">
      <Button
        type="submit"
        variant="ghost"
        className="w-full justify-start text-muted-foreground"
      >
        Log out
      </Button>
    </form>
  );
}
