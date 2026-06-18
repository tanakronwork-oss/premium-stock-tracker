import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RefreshCw, Search, Settings, Edit, Save, X, EyeOff, Eye, Trash2, Plus, ChevronUp, ChevronDown } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';

function ListDropdownManager({ label, items, onSave, placeholder }: { label: string, items: string[], onSave: (items: string[]) => void, placeholder: string }) {
  const [selected, setSelected] = useState<string>('');
  const [input, setInput] = useState('');

  const handleAdd = () => {
    if (!input.trim()) return;
    if (items.includes(input.trim())) {
      toast.error('This item already exists');
      return;
    }
    const newItems = [...items, input.trim()];
    setInput('');
    onSave(newItems);
    setSelected(input.trim());
  };

  const handleRemove = () => {
    if (!selected) return;
    const newItems = items.filter(item => item !== selected);
    onSave(newItems);
    setSelected('');
  };

  const handleEdit = () => {
    if (!selected || selected === 'none') return;
    const newName = prompt(`Edit ${label}:`, selected);
    if (newName && newName.trim() !== '' && newName.trim() !== selected) {
      if (items.includes(newName.trim())) {
        toast.error('This item already exists');
        return;
      }
      const newItems = items.map(item => item === selected ? newName.trim() : item);
      onSave(newItems);
      setSelected(newName.trim());
    }
  };

  const handleMoveUp = () => {
    if (!selected || selected === 'none') return;
    const index = items.indexOf(selected);
    if (index > 0) {
      const newItems = [...items];
      [newItems[index - 1], newItems[index]] = [newItems[index], newItems[index - 1]];
      onSave(newItems);
    }
  };

  const handleMoveDown = () => {
    if (!selected || selected === 'none') return;
    const index = items.indexOf(selected);
    if (index < items.length - 1 && index !== -1) {
      const newItems = [...items];
      [newItems[index + 1], newItems[index]] = [newItems[index], newItems[index + 1]];
      onSave(newItems);
    }
  };

  return (
    <div className="mb-6 bg-slate-50 p-4 rounded-md border border-slate-200">
      <label className="text-sm font-medium text-slate-700 mb-3 block">{label}</label>
      
      <div className="flex gap-2 mb-3">
        <div className="flex-1">
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger className="bg-white">
              <SelectValue placeholder={`Select item to manage...`} />
            </SelectTrigger>
            <SelectContent className="max-h-60 overflow-y-auto">
              {items.length === 0 && <SelectItem value="none">No items yet</SelectItem>}
              {items.map((item) => (
                <SelectItem key={item} value={item}>{item}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div className="flex shrink-0 gap-1 border border-slate-200 rounded-md bg-white p-0.5">
          <Button 
            variant="ghost" 
            size="sm"
            className="px-1.5 h-8 text-slate-500 hover:text-slate-900"
            onClick={handleMoveUp}
            disabled={!selected || selected === 'none' || items.indexOf(selected) <= 0}
            title="Move Up"
          >
            <ChevronUp className="w-4 h-4" />
          </Button>
          <Button 
            variant="ghost" 
            size="sm"
            className="px-1.5 h-8 text-slate-500 hover:text-slate-900"
            onClick={handleMoveDown}
            disabled={!selected || selected === 'none' || items.indexOf(selected) === -1 || items.indexOf(selected) >= items.length - 1}
            title="Move Down"
          >
            <ChevronDown className="w-4 h-4" />
          </Button>
        </div>

        <Button 
          variant="outline" 
          className="shrink-0 text-amber-500 hover:text-amber-600 hover:bg-amber-50 bg-white"
          onClick={handleEdit}
          disabled={!selected || selected === 'none'}
        >
          <Edit className="w-4 h-4 mr-1" /> Edit
        </Button>
        <Button 
          variant="outline" 
          className="shrink-0 text-rose-500 hover:text-rose-600 hover:bg-rose-50 bg-white"
          onClick={handleRemove}
          disabled={!selected || selected === 'none'}
        >
          <Trash2 className="w-4 h-4 mr-1" /> Delete
        </Button>
      </div>

      <div className="flex gap-2">
        <Input 
          value={input} 
          onChange={e => setInput(e.target.value)} 
          placeholder={placeholder}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }}
          className="flex-1 bg-white"
        />
        <Button variant="default" onClick={handleAdd} disabled={!input.trim()} className="shrink-0 bg-sky-500 text-white hover:bg-sky-600">
          <Plus className="w-4 h-4 mr-1" /> Add
        </Button>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSource, setSelectedSource] = useState<string>('all');
  const [stockFilter, setStockFilter] = useState<'all' | 'in-stock' | 'out-of-stock'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedSubCategory, setSelectedSubCategory] = useState<string>('all');
  const [selectedSubCategory2, setSelectedSubCategory2] = useState<string>('all');
  const [selectedSubCategory3, setSelectedSubCategory3] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('updated-desc');
  const [includeHidden, setIncludeHidden] = useState(false);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [editProduct, setEditProduct] = useState<{ id: number, name: string, category: string, subCategory: string, subCategory2: string, subCategory3: string } | null>(null);

  // Queries
  const { data: products, isLoading: productsLoading, refetch: refetchProducts } = trpc.products.list.useQuery({
    sourceId: selectedSource === 'all' ? undefined : parseInt(selectedSource),
    stockStatus: stockFilter,
    search: searchQuery || undefined,
    category: selectedCategory === 'all' ? undefined : selectedCategory,
    subCategory: selectedSubCategory === 'all' ? undefined : selectedSubCategory,
    subCategory2: selectedSubCategory2 === 'all' ? undefined : selectedSubCategory2,
    subCategory3: selectedSubCategory3 === 'all' ? undefined : selectedSubCategory3,
    sortBy: sortBy as any,
    includeHidden,
  });

  const { data: sources } = trpc.sources.getWithStats.useQuery();
  const { data: stats } = trpc.products.stats.useQuery();
  const { data: scraperStatus, refetch: refetchScraperStatus } = trpc.scraper.getStatus.useQuery();
  const { data: refreshInterval } = trpc.settings.getRefreshInterval.useQuery();
  const { data: categories, refetch: refetchCategories } = trpc.products.categories.useQuery({ includeHidden });
  const { data: subCategories, refetch: refetchSubCategories } = trpc.products.subCategories.useQuery({ category: selectedCategory === 'all' ? undefined : selectedCategory, includeHidden });
  const { data: subCategory2s, refetch: refetchSubCategory2s } = trpc.products.subCategory2s.useQuery({ category: selectedCategory === 'all' ? undefined : selectedCategory, subCategory: selectedSubCategory === 'all' ? undefined : selectedSubCategory, includeHidden });
  const { data: subCategory3s, refetch: refetchSubCategory3s } = trpc.products.subCategory3s.useQuery({ category: selectedCategory === 'all' ? undefined : selectedCategory, includeHidden });
  const { data: hiddenCategories, refetch: refetchHiddenCategories } = trpc.products.getHiddenCategories.useQuery();
  const { data: managedLists, refetch: refetchManagedLists } = trpc.products.getManagedLists.useQuery();

  // Mutations
  const saveManagedList = trpc.products.saveManagedList.useMutation({
    onSuccess: () => {
      toast.success('✅ Options saved successfully!');
      refetchManagedLists();
    }
  });

  const runScraper = trpc.scraper.runNow.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success('✅ Data refreshed successfully!');
        refetchProducts();
        refetchScraperStatus();
        refetchCategories();
        refetchSubCategories();
        refetchSubCategory2s();
      } else {
        toast.error(`❌ Scrape failed: ${data.error}`);
      }
    },
    onError: (error) => {
      toast.error(`❌ Error: ${error.message}`);
    },
  });

  const updateProduct = trpc.products.update.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success('✅ Product updated successfully!');
        refetchProducts();
        refetchCategories();
        refetchSubCategories();
        refetchSubCategory2s();
        setEditProduct(null);
      } else {
        toast.error('❌ Failed to update product');
      }
    },
    onError: (error) => {
      toast.error(`❌ Error: ${error.message}`);
    },
  });

  const setProductHidden = trpc.products.setHidden.useMutation({
    onSuccess: () => {
      toast.success('✅ Product visibility updated');
      refetchProducts();
    }
  });

  const setCategoryHidden = trpc.products.setCategoryHidden.useMutation({
    onSuccess: () => {
      toast.success('✅ Category visibility updated');
      refetchProducts();
      refetchCategories();
      refetchSubCategories();
      refetchSubCategory2s();
      refetchHiddenCategories();
    }
  });

  // Auto-refresh effect - now runs scraper instead of just refetching
  useEffect(() => {
    if (!refreshInterval) return;
    
    const interval = setInterval(() => {
      console.log('🔄 Auto-refresh triggered');
      runScraper.mutate();
    }, refreshInterval.interval * 1000);

    return () => clearInterval(interval);
  }, [refreshInterval?.interval]);

  const formatTime = (timestamp: number) => {
    if (!timestamp) return 'Never';
    return new Date(timestamp).toLocaleString();
  };

  const getStockBadge = (stock: number) => {
    return stock > 0 ? (
      <Badge className="bg-emerald-500 hover:bg-emerald-600">In Stock ({stock})</Badge>
    ) : (
      <Badge className="bg-rose-500 hover:bg-rose-600">Out of Stock</Badge>
    );
  };

  const filteredProducts = products || [];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Premium Stock Tracker</h1>
              <p className="text-slate-600 text-sm mt-1">Real-time inventory monitoring across {sources?.length || 0} sources</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-emerald-500 rounded-full live-indicator"></div>
                <span className="text-sm text-slate-600">
                  Last updated: {formatTime(scraperStatus?.lastScrapedAt || 0)}
                </span>
              </div>
              <Button
                onClick={() => runScraper.mutate()}
                disabled={runScraper.isPending}
                className="bg-sky-500 hover:bg-sky-600"
              >
                {runScraper.isPending ? (
                  <>
                    <Spinner className="w-4 h-4 mr-2" />
                    Refreshing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Refresh Now
                  </>
                )}
              </Button>
              <Button variant="outline" onClick={() => setLocation('/settings')}>
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-[1600px] mx-auto px-4 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600">Total Products</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-slate-900">{stats?.total || 0}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-emerald-600">In Stock</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-emerald-600">{stats?.inStock || 0}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-rose-600">Out of Stock</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-rose-600">{stats?.outOfStock || 0}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-sky-600">Sources</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-sky-600">{sources?.length || 0}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-8">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle>Filters</CardTitle>
            <div className="flex items-center space-x-2">
              <input type="checkbox" id="show-hidden" checked={includeHidden} onChange={(e) => setIncludeHidden(e.target.checked)} className="w-4 h-4 text-sky-600 rounded border-slate-300 focus:ring-sky-500 cursor-pointer" />
              <label htmlFor="show-hidden" className="text-sm font-medium text-slate-700 cursor-pointer select-none">Show Hidden Products</label>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
              <div>
                <label className="text-sm font-medium text-slate-700 mb-2 block">Search Product</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    placeholder="Search by product name..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700 mb-2 block">Source</label>
                <Select value={selectedSource} onValueChange={setSelectedSource}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-60 overflow-y-auto">
                    <SelectItem value="all">All Sources</SelectItem>
                    {sources?.map((source) => (
                      <SelectItem key={source.id} value={String(source.id)}>
                        {source.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700 mb-2 block">Stock Status</label>
                <Select value={stockFilter} onValueChange={(val: any) => setStockFilter(val)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Products</SelectItem>
                    <SelectItem value="in-stock">In Stock</SelectItem>
                    <SelectItem value="out-of-stock">Out of Stock</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="relative">
                <label className="text-sm font-medium text-slate-700 mb-2 block">Category</label>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="absolute right-0 top-0 h-5 px-1 text-[10px] text-slate-400 hover:text-sky-600 -mt-0.5"
                  onClick={() => setShowCategoryManager(true)}
                >
                  Manage
                </Button>
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-60 overflow-y-auto">
                    <SelectItem value="all">All Categories</SelectItem>
                    {managedLists?.categories?.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700 mb-2 block">ประเภท</label>
                <Select value={selectedSubCategory} onValueChange={setSelectedSubCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-60 overflow-y-auto">
                    <SelectItem value="all">All Types</SelectItem>
                    {managedLists?.types?.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700 mb-2 block">ความชัด</label>
                <Select value={selectedSubCategory2} onValueChange={setSelectedSubCategory2}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-60 overflow-y-auto">
                    <SelectItem value="all">All Qualities</SelectItem>
                    {managedLists?.qualities?.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700 mb-2 block">จำนวนวัน</label>
                <Select value={selectedSubCategory3} onValueChange={setSelectedSubCategory3}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-60 overflow-y-auto">
                    <SelectItem value="all">All Sub Cat 3</SelectItem>
                    {(managedLists as any)?.subCategory3s?.map((cat: string) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700 mb-2 block">Sort By</label>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-60 overflow-y-auto">
                    <SelectItem value="updated-desc">Latest Updated</SelectItem>
                    <SelectItem value="price-asc">Price: Low → High</SelectItem>
                    <SelectItem value="price-desc">Price: High → Low</SelectItem>
                    <SelectItem value="name-asc">Name: A → Z</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Products Table */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle>Products</CardTitle>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setIncludeHidden(!includeHidden)}
              className={includeHidden ? "bg-slate-100" : ""}
            >
              {includeHidden ? <Eye className="w-4 h-4 mr-2" /> : <EyeOff className="w-4 h-4 mr-2" />}
              {includeHidden ? "Showing Hidden" : "Show Hidden"}
            </Button>
          </CardHeader>
          <CardContent>
            {productsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Spinner className="w-6 h-6" />
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-slate-500 text-lg">No products found</p>
                <p className="text-slate-400 text-sm mt-2">
                  {runScraper.isPending ? 'Loading products...' : 'Click "Refresh Now" to fetch products'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-3 px-4 font-semibold text-slate-900 whitespace-nowrap">Product Name</th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-900 whitespace-nowrap">Source</th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-900 whitespace-nowrap">Category</th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-900 whitespace-nowrap">ประเภท</th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-900 whitespace-nowrap">ความชัด</th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-900 whitespace-nowrap">จำนวนวัน</th>
                      <th className="text-right py-3 px-4 font-semibold text-slate-900 whitespace-nowrap">Price</th>
                      <th className="text-center py-3 px-4 font-semibold text-slate-900 whitespace-nowrap">Stock</th>
                      <th className="text-center py-3 px-4 font-semibold text-slate-900 whitespace-nowrap">Status</th>
                      <th className="text-right py-3 px-4 font-semibold text-slate-900 whitespace-nowrap">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.map((product) => (
                      <tr key={`${product.sourceId}-${product.externalId}`} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-3 px-4 text-slate-900 font-medium">
                          <span>{product.name}</span>
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          {sources?.find(s => s.id === product.sourceId)?.name || 'Unknown'}
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          {product.category || '-'}
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          {product.subCategory || '-'}
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          {product.subCategory2 || '-'}
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          {product.tags || '-'}
                        </td>
                        <td className="py-3 px-4 text-right text-slate-900">
                          {Number(product.price) > 0 ? `฿${Number(product.price).toFixed(2)}` : '-'}
                        </td>
                        <td className="py-3 px-4 text-center text-slate-900">{product.stock}</td>
                        <td className="py-3 px-4 text-center">
                          {getStockBadge(product.stock)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-slate-400 hover:text-sky-600 px-2"
                              onClick={() => setEditProduct({ id: product.id, name: product.name, category: product.category || '', subCategory: product.subCategory || '', subCategory2: product.subCategory2 || '', subCategory3: product.tags || '' })}
                              title="Edit"
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className={`px-2 ${product.isHidden ? 'text-amber-500 hover:text-amber-600' : 'text-slate-400 hover:text-rose-600'}`}
                              onClick={() => setProductHidden.mutate({ productId: product.id, isHidden: !product.isHidden })}
                              title={product.isHidden ? "Restore Product" : "Hide Product"}
                            >
                              {product.isHidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Edit Product Dialog */}
        <Dialog open={!!editProduct} onOpenChange={(open) => !open && setEditProduct(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Product</DialogTitle>
            </DialogHeader>
            {editProduct && (
              <div className="space-y-4 pt-4">
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-1 block">Product Name</label>
                  <Input
                    value={editProduct.name}
                    onChange={(e) => setEditProduct({ ...editProduct, name: e.target.value })}
                    placeholder="Enter clean product name"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Edit the name to remove unwanted Thai text or extra tags from the source.
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-1 block">Category</label>
                  <Select value={editProduct.category || "none"} onValueChange={(val) => setEditProduct({ ...editProduct, category: val === "none" ? "" : val })}>
                    <SelectTrigger><SelectValue placeholder="Select Category" /></SelectTrigger>
                    <SelectContent className="max-h-60 overflow-y-auto">
                      <SelectItem value="none">- ไม่ระบุ -</SelectItem>
                      {managedLists?.categories?.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="text-sm font-medium text-slate-700 mb-1 block">ประเภท</label>
                    <Select value={editProduct.subCategory || "none"} onValueChange={(val) => setEditProduct({ ...editProduct, subCategory: val === "none" ? "" : val })}>
                      <SelectTrigger><SelectValue placeholder="Select Type" /></SelectTrigger>
                      <SelectContent className="max-h-60 overflow-y-auto">
                        <SelectItem value="none">- ไม่ระบุ -</SelectItem>
                        {managedLists?.types?.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700 mb-1 block">ความชัด</label>
                    <Select value={editProduct.subCategory2 || "none"} onValueChange={(val) => setEditProduct({ ...editProduct, subCategory2: val === "none" ? "" : val })}>
                      <SelectTrigger><SelectValue placeholder="Select Quality" /></SelectTrigger>
                      <SelectContent className="max-h-60 overflow-y-auto">
                        <SelectItem value="none">- ไม่ระบุ -</SelectItem>
                        {managedLists?.qualities?.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700 mb-1 block">จำนวนวัน</label>
                    <Select value={editProduct.subCategory3 || "none"} onValueChange={(val) => setEditProduct({ ...editProduct, subCategory3: val === "none" ? "" : val })}>
                      <SelectTrigger><SelectValue placeholder="Select Sub Cat 3" /></SelectTrigger>
                      <SelectContent className="max-h-60 overflow-y-auto">
                        <SelectItem value="none">- ไม่ระบุ -</SelectItem>
                        {(managedLists as any)?.subCategory3s?.map((c: string) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setEditProduct(null)}>
                    <X className="w-4 h-4 mr-2" /> Cancel
                  </Button>
                  <Button
                    className="bg-sky-500 hover:bg-sky-600"
                    disabled={updateProduct.isPending || !editProduct.name.trim()}
                    onClick={() => updateProduct.mutate({
                      productId: editProduct.id,
                      name: editProduct.name.trim(),
                      category: editProduct.category.trim(),
                      subCategory: editProduct.subCategory.trim(),
                      subCategory2: editProduct.subCategory2.trim(),
                      tags: editProduct.subCategory3.trim()
                    })}
                  >
                    <Save className="w-4 h-4 mr-2" /> Save Changes
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={showCategoryManager} onOpenChange={setShowCategoryManager}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Manage Settings & Categories</DialogTitle>
            </DialogHeader>
            <div className="space-y-2 pt-4 max-h-[70vh] overflow-y-auto px-1">
              <ListDropdownManager 
                label="Categories" 
                items={managedLists?.categories || []} 
                onSave={(items) => saveManagedList.mutate({ listName: "managedCategories", items })}
                placeholder="Add new category (e.g. Netflix)"
              />
              <ListDropdownManager 
                label="ประเภท" 
                items={managedLists?.types || []} 
                onSave={(items) => saveManagedList.mutate({ listName: "managedTypes", items })}
                placeholder="Add new type (e.g. หาร 2)"
              />
              <ListDropdownManager 
                label="ความชัด" 
                items={managedLists?.qualities || []} 
                onSave={(items) => saveManagedList.mutate({ listName: "managedQualities", items })}
                placeholder="Add new quality (e.g. 4K)"
              />
              <ListDropdownManager 
                label="จำนวนวัน" 
                items={(managedLists as any)?.subCategory3s || []} 
                onSave={(items) => saveManagedList.mutate({ listName: "managedSubCategory3s", items })}
                placeholder="Add new sub category (e.g. 30 วัน)"
              />
              
              <hr className="my-6 border-slate-200" />
              <h3 className="font-semibold text-slate-800">Hidden Categories</h3>
              <p className="text-xs text-slate-500 mb-2">
                You can hide categories here. Hidden categories and their products will not appear in the dashboard unless you click "Show Hidden".
              </p>
              <div className="space-y-2">
                {categories?.map(cat => (
                  <div key={cat} className="flex items-center justify-between p-2 rounded-md border border-slate-100">
                    <span className="text-sm font-medium">{cat}</span>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="text-slate-400 hover:text-rose-600"
                      onClick={() => setCategoryHidden.mutate({ category: cat, isHidden: true })}
                      title="Hide Category"
                    >
                      <EyeOff className="w-4 h-4 mr-2" /> Hide
                    </Button>
                  </div>
                ))}
                {hiddenCategories?.map(cat => (
                  <div key={cat} className="flex items-center justify-between p-2 rounded-md border border-slate-100 bg-slate-50">
                    <span className="text-sm font-medium text-slate-400 line-through">{cat}</span>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="text-amber-500 hover:text-amber-600"
                      onClick={() => setCategoryHidden.mutate({ category: cat, isHidden: false })}
                      title="Restore Category"
                    >
                      <Eye className="w-4 h-4 mr-2" /> Restore
                    </Button>
                  </div>
                ))}
                {(!categories || categories.length === 0) && (!hiddenCategories || hiddenCategories.length === 0) && (
                  <p className="text-center text-sm text-slate-400 py-4">No categories found.</p>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>


      </div>
    </div>
  );
}
