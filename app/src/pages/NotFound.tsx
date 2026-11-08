import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "react-router";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <Card className="w-full max-w-sm text-center">
        <CardHeader>
          <CardTitle className="text-4xl font-bold">404</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">Такой главы нет на карте.</p>
          <Button asChild className="min-h-11 w-full">
            <Link to="/">Вернуться к герою</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
