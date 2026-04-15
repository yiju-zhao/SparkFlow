import { Button } from "@/components/ui/button";
import { getVenues } from "@/lib/actions/admin";
import { VenueForm } from "./components/venue-form";

export default async function VenuesPage() {
  const venues = await getVenues();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Venues</h1>
        <VenueForm trigger={<Button>New Venue</Button>} />
      </div>

      {venues.length === 0 ? (
        <p className="text-sm text-muted-foreground">No venues yet. Create one to get started.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="pb-2 font-medium">Name</th>
              <th className="pb-2 font-medium">Type</th>
              <th className="pb-2 font-medium">Instances</th>
              <th className="pb-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {venues.map((venue) => (
              <tr key={venue.id} className="border-b">
                <td className="py-3">{venue.name}</td>
                <td className="py-3 text-muted-foreground">{venue.type ?? "—"}</td>
                <td className="py-3">{venue._count.instances}</td>
                <td className="py-3">
                  <VenueForm
                    venue={venue}
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
