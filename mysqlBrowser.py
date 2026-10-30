import tkinter as tk
from tkinter import ttk
import mysql.connector

/*
编写一个 Python 的 GUI 程序来浏览 MySQL 数据库，我们可以使用Tkinter（Python 内置的 GUI 库）和mysql - connector - python（用于连接 MySQL 数据库）。以下是一个示例代码，它允许你指定数据库地址、账号、密码，列举数据库表及字段，并显示各行内容。
pip install mysql - connector - python
*/
def connect_to_database():
    host = entry_host.get()
    user = entry_user.get()
    password = entry_password.get()
    try:
        conn = mysql.connector.connect(
            host=host,
            user=user,
            password=password
        )
        cursor = conn.cursor()
        cursor.execute("SHOW DATABASES")
        databases = cursor.fetchall()
        display_databases(databases)
        conn.close()
    except mysql.connector.Error as err:
        print(f"Error: {err}")


def display_databases(databases):
    listbox_databases.delete(0, tk.END)
    for db in databases:
        listbox_databases.insert(tk.END, db[0])


def show_tables():
    selected_database = listbox_databases.get(listbox_databases.curselection())
    host = entry_host.get()
    user = entry_user.get()
    password = entry_password.get()
    try:
        conn = mysql.connector.connect(
            host=host,
            user=user,
            password=password,
            database=selected_database
        )
        cursor = conn.cursor()
        cursor.execute("SHOW TABLES")
        tables = cursor.fetchall()
        display_tables(tables)
        conn.close()
    except mysql.connector.Error as err:
        print(f"Error: {err}")


def display_tables(tables):
    listbox_tables.delete(0, tk.END)
    for table in tables:
        listbox_tables.insert(tk.END, table[0])


def show_columns_and_data():
    selected_database = listbox_databases.get(listbox_databases.curselection())
    selected_table = listbox_tables.get(listbox_tables.curselection())
    host = entry_host.get()
    user = entry_user.get()
    password = entry_password.get()
    try:
        conn = mysql.connector.connect(
            host=host,
            user=user,
            password=password,
            database=selected_database
        )
        cursor = conn.cursor()
        cursor.execute(f"DESCRIBE {selected_table}")
        columns = cursor.fetchall()
        display_columns(columns)
        cursor.execute(f"SELECT * FROM {selected_table}")
        data = cursor.fetchall()
        display_data(data)
        conn.close()
    except mysql.connector.Error as err:
        print(f"Error: {err}")


def display_columns(columns):
    treeview_columns.delete(*treeview_columns.get_children())
    for col in columns:
        treeview_columns.insert("", tk.END, values=col)


def display_data(data):
    treeview_data.delete(*treeview_data.get_children())
    for row in data:
        treeview_data.insert("", tk.END, values=row)


root = tk.Tk()
root.title("MySQL Database Browser")

frame_connection = ttk.Frame(root, padding="10")
frame_connection.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))

ttk.Label(frame_connection, text="Host:").grid(row=0, column=0, sticky=tk.W)
entry_host = ttk.Entry(frame_connection)
entry_host.grid(row=0, column=1, sticky=(tk.W, tk.E))

ttk.Label(frame_connection, text="User:").grid(row=1, column=0, sticky=tk.W)
entry_user = ttk.Entry(frame_connection)
entry_user.grid(row=1, column=1, sticky=(tk.W, tk.E))

ttk.Label(frame_connection, text="Password:").grid(row=2, column=0, sticky=tk.W)
entry_password = ttk.Entry(frame_connection, show="*")
entry_password.grid(row=2, column=1, sticky=(tk.W, tk.E))

connect_button = ttk.Button(frame_connection, text="Connect", command=connect_to_database)
connect_button.grid(row=3, column=0, columnspan=2, pady=10)

frame_databases = ttk.Frame(root, padding="10")
frame_databases.grid(row=0, column=1, sticky=(tk.W, tk.E, tk.N, tk.S))

ttk.Label(frame_databases, text="Databases:").grid(row=0, column=0, sticky=tk.W)
listbox_databases = tk.Listbox(frame_databases)
listbox_databases.grid(row=1, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
show_tables_button = ttk.Button(frame_databases, text="Show Tables", command=show_tables)
show_tables_button.grid(row=2, column=0, pady=10)

frame_tables = ttk.Frame(root, padding="10")
frame_tables.grid(row=0, column=2, sticky=(tk.W, tk.E, tk.N, tk.S))

ttk.Label(frame_tables, text="Tables:").grid(row=0, column=0, sticky=tk.W)
listbox_tables = tk.Listbox(frame_tables)
listbox_tables.grid(row=1, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
show_columns_button = ttk.Button(frame_tables, text="Show Columns and Data", command=show_columns_and_data)
show_columns_button.grid(row=2, column=0, pady=10)

frame_columns = ttk.Frame(root, padding="10")
frame_columns.grid(row=1, column=1, sticky=(tk.W, tk.E, tk.N, tk.S))

ttk.Label(frame_columns, text="Columns:").grid(row=0, column=0, sticky=tk.W)
treeview_columns = ttk.Treeview(frame_columns, columns=("Field", "Type", "Null", "Key", "Default", "Extra"), show="headings")
treeview_columns.heading("Field", text="Field")
treeview_columns.heading("Type", text="Type")
treeview_columns.heading("Null", text="Null")
treeview_columns.heading("Key", text="Key")
treeview_columns.heading("Default", text="Default")
treeview_columns.heading("Extra", text="Extra")
treeview_columns.grid(row=1, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))

frame_data = ttk.Frame(root, padding="10")
frame_data.grid(row=1, column=2, sticky=(tk.W, tk.E, tk.N, tk.S))

ttk.Label(frame_data, text="Data:").grid(row=0, column=0, sticky=tk.W)
treeview_data = ttk.Treeview(frame_data, show="headings")
treeview_data.grid(row=1, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))

for i in range(3):
    root.grid_columnconfigure(i, weight=1)
root.grid_rowconfigure(0, weight=1)
root.grid_rowconfigure(1, weight=1)

root.mainloop()