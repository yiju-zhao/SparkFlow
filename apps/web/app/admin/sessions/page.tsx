import { Button } from "@/components/ui/button";
import { getSessions, getInstances } from "@/lib/actions/admin";
import { SessionForm } from "./components/session-form";

export default async function SessionsPage() {
  const [sessions, instances] = await Promise.all([
    getSessions(),
    getInstances(),
  ]);

  const instanceList = instances.map((inst) => ({
    id: inst.id,
    name: inst.name,
    year: inst.year,
    venue: { name: inst.venue.name },
  }));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Sessions</h1>
        <SessionForm
          instances={instanceList}
          trigger={<Button>New Session</Button>}
        />
      </div>

      {sessions.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No sessions yet. Create one to get started.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="pb-2 font-medium">Title</th>
              <th className="pb-2 font-medium">Instance</th>
              <th className="pb-2 font-medium">Type</th>
              <th className="pb-2 font-medium">Date</th>
              <th className="pb-2 font-medium">Speakers</th>
              <th className="pb-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((sess) => (
              <tr key={sess.id} className="border-b">
                <td className="py-3 max-w-xs truncate">{sess.title}</td>
                <td className="py-3 text-muted-foreground whitespace-nowrap">
                  {sess.instance.venue.name} {sess.instance.year}
                </td>
                <td className="py-3 text-muted-foreground">
                  {sess.type ?? "—"}
                </td>
                <td className="py-3 text-muted-foreground whitespace-nowrap">
                  {sess.date
                    ? new Date(sess.date).toLocaleDateString()
                    : "—"}
                </td>
                <td className="py-3 text-muted-foreground max-w-xs truncate">
                  {sess.speaker.length > 0 ? sess.speaker.join(", ") : "—"}
                </td>
                <td className="py-3">
                  <SessionForm
                    session={sess}
                    instances={instanceList}
                    trigger={
                      <Button variant="outline" size="sm">
                        Edit
                      </Button>
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
