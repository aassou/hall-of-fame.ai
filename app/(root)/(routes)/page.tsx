import prismadb from "@/lib/prismadb";
import Categories from "@/components/categories";
import SearchInput from "@/components/search-input";
import Companions from "@/components/companion";

interface RootPageProps {
  searchParams: {
    categoryId: string;
    name: string;
  }
}

const RootPage = async ({
  searchParams
}: RootPageProps) => {
  const data = await prismadb.companion.findMany({
    where: {
      categoryId: searchParams.categoryId,
      name: {
        search: searchParams.name
      }
    },
    orderBy: {
      createdAt: "desc",
    },
    include: {
      _count: {
        select: {
          messages: true
        }
      }
    }
  });
  const categories = await prismadb.category.findMany();
  console.log(categories);

  return ( 
    <div className="h-full p-4 pl-24 space-y-2">
      <SearchInput />
      <Categories data={categories} />
      <Companions data={data} />
    </div>
  );
}
 
export default RootPage;
