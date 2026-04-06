import { getInstances } from "@/lib/actions/admin";
import { PublicationList } from "./components/publication-list";

export default async function PublicationsPage() {
  const instances = await getInstances();

  const instanceList = instances.map((inst) => ({
    id: inst.id,
    name: inst.name,
    year: inst.year,
    venue: { name: inst.venue.name },
  }));

  return <PublicationList instances={instanceList} />;
}
