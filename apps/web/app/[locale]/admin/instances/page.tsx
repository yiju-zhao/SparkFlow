import { Button } from "@/components/ui/button";
import { getInstances, getVenues } from "@/lib/actions/admin";
import publicationSample from "@/lib/import/examples/publications-sample.json";
import sessionSample from "@/lib/import/examples/sessions-sample.json";
import { FormatGuideDialog } from "./components/format-guide-dialog";
import { InstanceForm } from "./components/instance-form";

export default async function InstancesPage() {
  const [instances, venues] = await Promise.all([getInstances(), getVenues()]);

  const venueList = venues.map((v) => ({ id: v.id, name: v.name }));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Instances</h1>
        <div className="flex items-center gap-2">
          <FormatGuideDialog publicationSample={publicationSample} sessionSample={sessionSample} />
          <InstanceForm venues={venueList} trigger={<Button>New Instance</Button>} />
        </div>
      </div>

      {instances.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No instances yet. Create one to get started.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="pb-2 font-medium">Venue</th>
              <th className="pb-2 font-medium">Year</th>
              <th className="pb-2 font-medium">Name</th>
              <th className="pb-2 font-medium">Dates</th>
              <th className="pb-2 font-medium">Sessions</th>
              <th className="pb-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {instances.map((inst) => (
              <tr key={inst.id} className="border-b">
                <td className="py-3">{inst.venue.name}</td>
                <td className="py-3">{inst.year}</td>
                <td className="py-3">{inst.name}</td>
                <td className="py-3 text-muted-foreground">
                  {inst.startDate ? new Date(inst.startDate).toISOString().split("T")[0] : "—"}
                  {inst.endDate ? ` – ${new Date(inst.endDate).toISOString().split("T")[0]}` : ""}
                </td>
                <td className="py-3">{inst._count.sessions}</td>
                <td className="py-3">
                  <InstanceForm
                    instance={inst}
                    venues={venueList}
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
