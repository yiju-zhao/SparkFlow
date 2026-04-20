import { getInstances } from "@/lib/actions/admin";
import { SessionList } from "./_components/session-list";

export default async function SessionsPage() {
  const instances = await getInstances();

  const instanceList = instances.map((inst) => ({
    id: inst.id,
    name: inst.name,
    year: inst.year,
    venue: { name: inst.venue.name },
  }));

  return <SessionList instances={instanceList} />;
}
