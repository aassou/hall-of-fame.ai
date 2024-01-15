import Categories from "@/components/categories";
import SearchInput from "@/components/search-input";
import prismadb from "@/lib/prismadb";
import { UserButton } from "@clerk/nextjs";

const RootPage = async () => {
  const categories = await prismadb.category.findMany();
  console.log(categories);

  return ( 
    <div className="h-full p-4 pl-24 space-y-2">
      <SearchInput />
      <Categories data={categories} />
    </div>
  );
}
 
export default RootPage;
