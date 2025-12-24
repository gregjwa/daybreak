import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useProjects, useCreateProject } from "@/api/useProjects";
import { Button } from "@/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/ui/card";
import { ArrowRight, CircleNotch, Plus } from "@phosphor-icons/react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/ui/dialog";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";

const ProjectList = () => {
    const { data: projects, isLoading } = useProjects();
    const { mutate: createProject, isPending: isCreating } = useCreateProject();
    const navigate = useNavigate();
    
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [newProject, setNewProject] = useState({ name: "", type: "" });

    const handleCreate = (e: React.FormEvent) => {
        e.preventDefault();
        createProject(newProject, {
            onSuccess: (project) => {
                setIsCreateOpen(false);
                // Navigate to the new project
                navigate(`/projects/${project.id}/vendors`);
            }
        });
    };

    if (isLoading) return <div className="p-8 flex justify-center"><CircleNotch className="animate-spin text-muted-foreground" /></div>;

    return (
        <div className="p-8 max-w-6xl mx-auto space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-medium tracking-tight">Projects</h1>
                    <p className="text-muted-foreground mt-1">Manage your events and vendors</p>
                </div>
                <Button onClick={() => setIsCreateOpen(true)} className="gap-2">
                    <Plus className="h-4 w-4" weight="bold" />
                    New Project
                </Button>
            </div>

            {projects && projects.length === 0 ? (
                <div className="text-center py-20 bg-surface-card rounded-lg border border-border-subtle border-dashed">
                    <h3 className="text-lg font-medium">No projects yet</h3>
                    <p className="text-muted-foreground mb-4">Create your first project to get started</p>
                    <Button variant="outline" onClick={() => setIsCreateOpen(true)}>Create Project</Button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {projects?.map((project) => (
                        <Card key={project.id} className="group hover:border-primary/20 transition-all cursor-pointer bg-surface-card shadow-sm hover:shadow-md">
                            <Link to={`/projects/${project.id}/vendors`} className="block h-full">
                                <CardHeader>
                                    <CardTitle className="text-xl group-hover:text-primary transition-colors">
                                        {project.name}
                                    </CardTitle>
                                    <CardDescription>{project.type || "Event"}</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="flex justify-between items-center text-sm text-muted-foreground">
                                        <span>{project._count?.suppliers || 0} Vendors</span>
                                        <ArrowRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity -translate-x-2 group-hover:translate-x-0" />
                                    </div>
                                </CardContent>
                            </Link>
                        </Card>
                    ))}
                </div>
            )}

            {/* Create Dialog */}
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Create New Project</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleCreate} className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="name">Project Name</Label>
                            <Input 
                                id="name" 
                                placeholder="Summer Gala 2024"
                                value={newProject.name}
                                onChange={e => setNewProject({...newProject, name: e.target.value})}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="type">Event Type</Label>
                            <Input 
                                id="type" 
                                placeholder="Wedding, Corporate..." 
                                value={newProject.type}
                                onChange={e => setNewProject({...newProject, type: e.target.value})}
                                required
                            />
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="ghost" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                            <Button type="submit" disabled={isCreating}>
                                {isCreating && <CircleNotch className="mr-2 h-4 w-4 animate-spin" />}
                                Create Project
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default ProjectList;

